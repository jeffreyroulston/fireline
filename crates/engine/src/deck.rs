use crate::{
    cards::{CARD_COUNT, Card},
    error::{EngineError, Result},
    line_event::LineEvent,
    model::{
        DamageDistribution, EffectiveRequest, SimType, SolveRequest, TwoPassResult,
        hand_duration, resolve_materials_bitmask,
    },
    random::{Rng, percentile, shuffle_cards},
    solver::solve_for_deck_eval,
};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};

#[cfg(feature = "ts")]
use ts_rs::TS;

use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use rayon::prelude::*;

fn sim_uses_heavy_search(sim_type: SimType) -> bool {
    matches!(
        sim_type,
        SimType::MonteCarlo | SimType::OracleOnly | SimType::TwoPass
    )
}

/// Threads requested for hand parallelism: `RAYON_NUM_THREADS` if set and
/// valid, else the CPU count.
fn requested_threads() -> usize {
    let cpus = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(6);
    std::env::var("RAYON_NUM_THREADS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(cpus)
}

/// Hand parallelism for deck eval. `RAYON_NUM_THREADS` is an upper bound;
/// heavy sims are also capped by the process-global memory budget.
pub fn hand_threads(sim_type: SimType) -> usize {
    let requested = requested_threads();
    if !sim_uses_heavy_search(sim_type) {
        return requested;
    }
    crate::pressure::max_heavy_hands(requested)
}

/// Shared pool for deck-eval hand parallelism, sized once from the CPU count
/// (or `RAYON_NUM_THREADS`). Concurrent heavy hands are capped by the
/// process-global [`crate::pressure::MemoryGate`].
fn shared_pool() -> Result<&'static rayon::ThreadPool> {
    static POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();
    if let Some(pool) = POOL.get() {
        return Ok(pool);
    }
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(requested_threads())
        .build()?;
    // A concurrent request may win the race; dropping the loser joins its threads.
    Ok(POOL.get_or_init(|| pool))
}

/// Logical CPU count (respects `RAYON_NUM_THREADS` when set).
pub fn cpu_count() -> usize {
    requested_threads()
}

fn job_thread_cap(max_threads: Option<u16>) -> Option<usize> {
    max_threads
        .filter(|&n| n > 0)
        .map(|n| usize::from(n).min(requested_threads()))
}

struct JobSemaphore {
    max: usize,
    active: Mutex<usize>,
    notify: Condvar,
}

impl JobSemaphore {
    fn new(max: usize) -> Self {
        Self {
            max,
            active: Mutex::new(0),
            notify: Condvar::new(),
        }
    }

    fn acquire(&self) -> JobPermit<'_> {
        let mut active = self.active.lock().unwrap_or_else(|err| err.into_inner());
        while *active >= self.max {
            active = self
                .notify
                .wait(active)
                .unwrap_or_else(|err| err.into_inner());
        }
        *active += 1;
        JobPermit { sem: self }
    }
}

struct JobPermit<'a> {
    sem: &'a JobSemaphore,
}

impl Drop for JobPermit<'_> {
    fn drop(&mut self) {
        let mut active = self.sem.active.lock().unwrap_or_else(|err| err.into_inner());
        *active = active.saturating_sub(1);
        self.sem.notify.notify_one();
    }
}

/// Emit `Throttled` after waiting this long for a memory-gate slot.
const THROTTLE_GRACE: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct DeckEvalRequest {
    pub deck: BTreeMap<String, u8>,
    #[serde(default = "default_samples")]
    pub samples: u16,
    #[serde(default = "default_true")]
    pub go_first: bool,
    #[serde(default = "default_turns")]
    pub max_turns: u8,
    #[serde(default = "default_seed")]
    pub seed: u64,
    #[serde(default)]
    pub sim_type: crate::model::SimType,
    #[serde(default = "default_rollouts")]
    pub rollouts: u16,
    #[serde(default)]
    pub budget: crate::budget::Budget,
    #[serde(default)]
    pub materials: BTreeMap<String, u8>,
    #[serde(default)]
    pub max_threads: Option<u16>,
    #[serde(default)]
    pub glimpse_enabled: Option<bool>,
    #[serde(default)]
    pub max_hand_duration_secs: Option<u16>,
    #[serde(default)]
    pub max_card_draw: Option<u16>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct SampleHand {
    pub hand: Vec<&'static str>,
    pub damage: u8,
    /// Final hand + memory on the chosen max-damage line.
    pub end_influence: u8,
    pub events: Vec<LineEvent>,
    pub nodes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distribution: Option<DamageDistribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_pass: Option<TwoPassResult>,
    /// Sparse per-card line counters for the chosen path (persist → run_sample_card_stats).
    #[serde(skip_serializing_if = "crate::stats::SparseLineStats::is_empty_stats")]
    pub line_card_stats: crate::stats::SparseLineStats,
    #[serde(skip)]
    #[cfg_attr(feature = "ts", ts(skip))]
    pub line_stats: crate::stats::LineCardStats,
    #[serde(skip)]
    #[cfg_attr(feature = "ts", ts(skip))]
    pub brick_line_stats: Option<crate::stats::LineCardStats>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct DeckEvalResult {
    pub sim_type: SimType,
    pub samples: usize,
    pub damages: Vec<u8>,
    pub hands: Vec<SampleHand>,
    pub mean: f64,
    pub p10: u8,
    pub p50: u8,
    pub p90: u8,
    pub max: u8,
    pub min: u8,
    /// Mean final hand + memory across sampled max-damage lines.
    pub mean_end_influence: f64,
    pub unique_hands: usize,
    pub states_searched: u64,
    pub elapsed_ms: f64,
    pub effective: EffectiveRequest,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub brick_card_stats: Vec<crate::stats::CardStat>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub oracle_card_stats: Vec<crate::stats::CardStat>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub timed_out_samples: usize,
}

const fn is_zero(value: &usize) -> bool {
    *value == 0
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct OptimizeRequest {
    pub bounds: BTreeMap<String, crate::model::Bounds>,
    pub deck_size: u8,
    #[serde(default = "default_ratio_samples")]
    pub samples: u16,
    /// How many unique legal lists to score.
    #[serde(default = "default_decks", alias = "iterations")]
    pub decks: u32,
    #[serde(default)]
    pub metric: Metric,
    #[serde(default = "default_seed")]
    pub seed: u64,
    #[serde(default)]
    pub budget: crate::budget::Budget,
    #[serde(default)]
    pub materials: BTreeMap<String, u8>,
    #[serde(default)]
    pub strategy: Strategy,
    #[serde(default)]
    pub base_deck: BTreeMap<String, u8>,
    #[serde(default)]
    pub swap: Option<SwapConfig>,
    #[serde(default)]
    pub multi_deck: Option<MultiDeckConfig>,
    #[serde(default = "default_true")]
    pub go_first: bool,
    #[serde(default = "default_turns")]
    pub max_turns: u8,
    #[serde(default)]
    pub sim_type: crate::model::SimType,
    #[serde(default = "default_rollouts")]
    pub rollouts: u16,
    #[serde(default)]
    pub max_threads: Option<u16>,
    #[serde(default)]
    pub glimpse_enabled: Option<bool>,
    #[serde(default)]
    pub max_hand_duration_secs: Option<u16>,
    #[serde(default)]
    pub max_card_draw: Option<u16>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum Strategy {
    #[default]
    RandomSample,
    HillClimb,
    Genetic,
    SwapSweep,
    MultiDeck,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct SwapConfig {
    pub from: String,
    pub count: u8,
    pub candidates: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct MultiDeckConfig {
    pub decks: Vec<BTreeMap<String, u8>>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum Metric {
    #[default]
    Mean,
    P50,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct HistoryPoint {
    pub iteration: u16,
    pub score: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct RankedDeck {
    pub rank: u8,
    pub score: f64,
    pub counts: BTreeMap<String, u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_delta: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalProgress {
    pub sample: u16,
    pub total: u16,
    pub rollout: u16,
    pub total_rollouts: u16,
}

/// Phase of a single opening-hand solve, for per-hand progress bars.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HandPhase {
    Started,
    /// Waiting for a memory-gate slot (thread cap, planned RAM budget, or park).
    Throttled,
    Rollout,
    Done,
    /// Hand exceeded the per-hand wall-clock limit and was excluded.
    TimedOut,
}

/// Progress for one concurrent opening hand (started / mid-rollout / done).
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandProgress {
    pub sample_index: u16,
    pub phase: HandPhase,
    pub rollout: u16,
    pub total_rollouts: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct OptimizeProgress {
    pub decks_scored: u32,
    pub total_decks: u32,
    pub legal_decks: u64,
    pub hands_simulated: u64,
    pub total_hands: u64,
    pub best_score: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct OptimizeResult {
    pub best_counts: BTreeMap<String, u8>,
    pub best_score: f64,
    pub top: Vec<RankedDeck>,
    pub history: Vec<HistoryPoint>,
    pub legal_decks: u64,
    pub decks_scored: u32,
    pub elapsed_ms: f64,
    pub effective: EffectiveRequest,
}

const fn default_samples() -> u16 {
    8
}
const fn default_ratio_samples() -> u16 {
    4
}
const fn default_decks() -> u32 {
    32
}
const fn default_seed() -> u64 {
    42
}
const fn default_true() -> bool {
    true
}
const fn default_turns() -> u8 {
    3
}
const fn default_rollouts() -> u16 {
    8
}

/// Legacy alias kept for documentation; use `Budget::default().max_optimize_decks`.
const _MAX_OPTIMIZE_DECKS: u32 = 5000;

#[derive(Clone)]
struct SampleDraw {
    drawn: Vec<Card>,
    key: [u8; CARD_COUNT],
    sample_index: u16,
}

fn hand_key(drawn: &[Card]) -> [u8; CARD_COUNT] {
    let mut key = [0_u8; CARD_COUNT];
    for &card in drawn {
        key[card.index()] += 1;
    }
    key
}

fn drawn_from_key(key: [u8; CARD_COUNT]) -> Vec<Card> {
    let mut drawn = Vec::new();
    for card in crate::cards::ALL_CARDS {
        drawn.extend(std::iter::repeat_n(card, key[card.index()] as usize));
    }
    drawn
}

/// Draw `samples` opening hands the same way deck eval does (for tooling /
/// calibration). Each sample reshuffles the full deck with the shared RNG.
pub fn draw_opening_hands(deck: &[Card], samples: u16, seed: u64) -> Result<Vec<Vec<Card>>> {
    if deck.len() < 7 {
        return Err(EngineError::invalid(
            "deck must contain at least seven recognized cards",
        ));
    }
    let mut rng = Rng::new(seed);
    let mut hands = Vec::with_capacity(samples as usize);
    for _ in 0..samples {
        let mut shuffled = deck.to_vec();
        shuffle_cards(&mut shuffled, &mut rng);
        hands.push(shuffled[..7].to_vec());
    }
    Ok(hands)
}

/// Shared read-only inputs for solving sampled hands. Grouping them keeps the
/// per-hand call sites readable and under the argument-count lint.
struct SampleContext<
    'a,
    F: FnMut(EvalProgress) -> ControlFlow<()> + Send,
    G: FnMut(HandProgress) -> ControlFlow<()> + Send,
> {
    request: &'a DeckEvalRequest,
    budget: &'a crate::budget::Budget,
    max_turns: u8,
    rollouts: u16,
    hands_total: u16,
    on_progress: &'a Mutex<F>,
    on_hand_progress: &'a Mutex<G>,
    report_in_hand_progress: bool,
    cancel: Option<crate::cancel::CancelFlag>,
}

fn solve_sample_hand(
    drawn: &[Card],
    sample_index: u16,
    hands_done: u16,
    ctx: &SampleContext<
        '_,
        impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
        impl FnMut(HandProgress) -> ControlFlow<()> + Send,
    >,
) -> Result<SampleHand> {
    let _cancel_guard = ctx
        .cancel
        .as_ref()
        .map(|flag| crate::cancel::install(flag.clone()));
    let _deadline_guard = hand_duration(ctx.request.max_hand_duration_secs).map(crate::deadline::install);
    let request = ctx.request;
    let total_rollouts = if request.sim_type == SimType::MonteCarlo {
        ctx.rollouts
    } else {
        1
    };
    if report_hand_progress(
        ctx.on_hand_progress,
        HandProgress {
            sample_index,
            phase: HandPhase::Started,
            rollout: 0,
            total_rollouts,
        },
    )
    .is_break()
    {
        return Err(EngineError::Cancelled);
    }
    if ctx.report_in_hand_progress
        && report_eval_progress(
            ctx.on_progress,
            EvalProgress {
                sample: hands_done,
                total: ctx.hands_total,
                rollout: 0,
                total_rollouts,
            },
        )
        .is_break()
    {
        return Err(EngineError::Cancelled);
    }
    let hand_ids = drawn.iter().map(|card| card.id().to_string()).collect();
    let result = solve_for_deck_eval(
        &SolveRequest {
            hand: hand_ids,
            go_first: request.go_first,
            max_turns: ctx.max_turns,
            sim_type: request.sim_type,
            deck: request.deck.clone(),
            queue: None,
            rollouts: ctx.rollouts,
            seed: request.seed.wrapping_add(u64::from(sample_index) * 17),
            budget: *ctx.budget,
            materials: request.materials.clone(),
            max_threads: None,
            glimpse_enabled: request.glimpse_enabled,
            max_hand_duration_secs: request.max_hand_duration_secs,
            max_card_draw: request.max_card_draw,
        },
        |rollout, total_rollouts| {
            if rollout > 0
                && report_hand_progress(
                    ctx.on_hand_progress,
                    HandProgress {
                        sample_index,
                        phase: HandPhase::Rollout,
                        rollout,
                        total_rollouts,
                    },
                )
                .is_break()
            {
                return ControlFlow::Break(());
            }
            if !ctx.report_in_hand_progress {
                return ControlFlow::Continue(());
            }
            report_eval_progress(
                ctx.on_progress,
                EvalProgress {
                    sample: hands_done,
                    total: ctx.hands_total,
                    rollout,
                    total_rollouts,
                },
            )
        },
    )?;
    if report_hand_progress(
        ctx.on_hand_progress,
        HandProgress {
            sample_index,
            phase: HandPhase::Done,
            rollout: total_rollouts,
            total_rollouts,
        },
    )
    .is_break()
    {
        return Err(EngineError::Cancelled);
    }
    let damage = match request.sim_type {
        SimType::MonteCarlo => result
            .distribution
            .as_ref()
            .map(|dist| dist.p50)
            .unwrap_or(result.max_damage),
        _ => result.max_damage,
    };
    Ok(SampleHand {
        hand: drawn.iter().map(|card| card.id()).collect(),
        damage,
        end_influence: result.end_influence,
        events: result.events,
        nodes: result.nodes,
        distribution: result.distribution,
        two_pass: result.two_pass,
        line_card_stats: result.line_stats.to_sparse(),
        line_stats: result.line_stats,
        brick_line_stats: result.brick_line_stats,
    })
}

fn solve_one_unique_hand(
    sim_type: SimType,
    key: [u8; CARD_COUNT],
    sample_index: u16,
    hands_done: u16,
    ctx: &SampleContext<
        '_,
        impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
        impl FnMut(HandProgress) -> ControlFlow<()> + Send,
    >,
) -> Result<((SimType, [u8; CARD_COUNT]), SampleHand)> {
    let drawn = drawn_from_key(key);
    let mut sample = solve_sample_hand(&drawn, sample_index, hands_done, ctx)?;
    sample.hand = drawn.iter().map(|card| card.id()).collect();
    Ok(((sim_type, key), sample))
}

fn report_eval_progress(
    on_progress: &Mutex<impl FnMut(EvalProgress) -> ControlFlow<()> + Send>,
    progress: EvalProgress,
) -> ControlFlow<()> {
    on_progress.lock().unwrap_or_else(|err| err.into_inner())(progress)
}

fn report_hand_progress(
    on_hand_progress: &Mutex<impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
    progress: HandProgress,
) -> ControlFlow<()> {
    on_hand_progress
        .lock()
        .unwrap_or_else(|err| err.into_inner())(progress)
}

#[expect(clippy::too_many_arguments)]
fn solve_unique_hands(
    unique: &[(SimType, [u8; CARD_COUNT], u16)],
    request: &DeckEvalRequest,
    budget: &crate::budget::Budget,
    max_turns: u8,
    rollouts: u16,
    on_progress: &Mutex<impl FnMut(EvalProgress) -> ControlFlow<()> + Send>,
    on_hand_progress: &Mutex<impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
    parallel: bool,
    cancel: Option<crate::cancel::CancelFlag>,
) -> Result<FxHashMap<(SimType, [u8; CARD_COUNT]), SampleHand>> {
    let total = request.samples.max(1);
    let total_rollouts = if request.sim_type == SimType::MonteCarlo {
        rollouts
    } else {
        1
    };
    let report_in_hand_progress = !parallel;
    let ctx = SampleContext {
        request,
        budget,
        max_turns,
        rollouts,
        hands_total: total,
        on_progress,
        on_hand_progress,
        report_in_hand_progress,
        cancel,
    };
    if !parallel {
        let mut cache = FxHashMap::default();
        for (index, &(sim_type, key, sample_index)) in unique.iter().enumerate() {
            if ctx.cancel.as_ref().is_some_and(crate::cancel::is_requested) {
                return finish_cancelled(ctx.cancel.as_ref(), cache);
            }
            let hands_done = u16::try_from(index).unwrap_or(u16::MAX);
            let (cache_key, sample) =
                match solve_one_unique_hand(sim_type, key, sample_index, hands_done, &ctx) {
                    Ok(solved) => solved,
                    Err(EngineError::Cancelled) => {
                        return finish_cancelled(ctx.cancel.as_ref(), cache);
                    }
                    Err(EngineError::HandTimeout) => {
                        let _ = report_hand_progress(
                            on_hand_progress,
                            HandProgress {
                                sample_index,
                                phase: HandPhase::TimedOut,
                                rollout: 0,
                                total_rollouts,
                            },
                        );
                        let n = u16::try_from(index + 1).unwrap_or(u16::MAX);
                        if report_eval_progress(
                            on_progress,
                            EvalProgress {
                                sample: n,
                                total,
                                rollout: 0,
                                total_rollouts,
                            },
                        )
                        .is_break()
                        {
                            return finish_cancelled(ctx.cancel.as_ref(), cache);
                        }
                        continue;
                    }
                    Err(error) => return Err(error),
                };
            cache.insert(cache_key, sample);
            let n = u16::try_from(index + 1).unwrap_or(u16::MAX);
            if report_eval_progress(
                on_progress,
                EvalProgress {
                    sample: n,
                    total,
                    rollout: 0,
                    total_rollouts,
                },
            )
            .is_break()
            {
                return finish_cancelled(ctx.cancel.as_ref(), cache);
            }
        }
        return Ok(cache);
    }

    let completed = AtomicU16::new(0);
    let cancelled = AtomicBool::new(false);
    // Shared pool is CPU-sized; the process-global memory gate caps concurrent
    // heavy hands across all runs. Fire Brick skips the gate (cheap search).
    let gate = sim_uses_heavy_search(request.sim_type)
        .then(|| crate::pressure::memory_gate(requested_threads()));
    let job_semaphore = job_thread_cap(request.max_threads).map(JobSemaphore::new);
    let pool = shared_pool()?;
    let cache = Mutex::new(FxHashMap::default());
    let first_error = Mutex::new(None::<EngineError>);
    // One job per hand. Rayon cannot steal the rest of a worker's chunk while
    // that worker is inside a long solve, so a single hard hand used to freeze
    // its leftover queue and drop the run to one thread.
    pool.install(|| {
        unique
            .par_iter()
            .with_max_len(1)
            .for_each(|&(sim_type, key, sample_index)| {
                if first_error
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .is_some()
                {
                    return;
                }
                if cancelled.load(Ordering::Relaxed)
                    || ctx.cancel.as_ref().is_some_and(crate::cancel::is_requested)
                {
                    cancelled.store(true, Ordering::Relaxed);
                    return;
                }
                let _thread_permit = job_semaphore.as_ref().map(|sem| sem.acquire());
                let _permit = gate.as_ref().map(|gate| {
                    gate.acquire_with_notify(THROTTLE_GRACE, || {
                        let _ = report_hand_progress(
                            on_hand_progress,
                            HandProgress {
                                sample_index,
                                phase: HandPhase::Throttled,
                                rollout: 0,
                                total_rollouts,
                            },
                        );
                    })
                });
                let hands_done = completed.load(Ordering::Relaxed);
                match solve_one_unique_hand(sim_type, key, sample_index, hands_done, &ctx) {
                    Ok((cache_key, sample)) => {
                        cache
                            .lock()
                            .unwrap_or_else(|err| err.into_inner())
                            .insert(cache_key, sample);
                        let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        if report_eval_progress(
                            on_progress,
                            EvalProgress {
                                sample: n,
                                total,
                                rollout: 0,
                                total_rollouts,
                            },
                        )
                        .is_break()
                        {
                            cancelled.store(true, Ordering::Relaxed);
                        }
                    }
                    Err(EngineError::Cancelled) => {
                        cancelled.store(true, Ordering::Relaxed);
                    }
                    Err(EngineError::HandTimeout) => {
                        let _ = report_hand_progress(
                            on_hand_progress,
                            HandProgress {
                                sample_index,
                                phase: HandPhase::TimedOut,
                                rollout: 0,
                                total_rollouts,
                            },
                        );
                        let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        if report_eval_progress(
                            on_progress,
                            EvalProgress {
                                sample: n,
                                total,
                                rollout: 0,
                                total_rollouts,
                            },
                        )
                        .is_break()
                        {
                            cancelled.store(true, Ordering::Relaxed);
                        }
                    }
                    Err(error) => {
                        let mut slot = first_error.lock().unwrap_or_else(|err| err.into_inner());
                        if slot.is_none() {
                            *slot = Some(error);
                        }
                        cancelled.store(true, Ordering::Relaxed);
                    }
                }
            });
    });
    if let Some(error) = first_error
        .into_inner()
        .unwrap_or_else(|err| err.into_inner())
    {
        return Err(error);
    }
    let cache = cache.into_inner().unwrap_or_else(|err| err.into_inner());
    if ctx.cancel.as_ref().is_some_and(crate::cancel::is_requested) {
        return finish_cancelled(ctx.cancel.as_ref(), cache);
    }
    Ok(cache)
}

fn finish_cancelled(
    cancel: Option<&crate::cancel::CancelFlag>,
    cache: FxHashMap<(SimType, [u8; CARD_COUNT]), SampleHand>,
) -> Result<FxHashMap<(SimType, [u8; CARD_COUNT]), SampleHand>> {
    if cancel.is_some_and(crate::cancel::is_save_requested_on) && !cache.is_empty() {
        return Ok(cache);
    }
    Err(EngineError::Cancelled)
}

pub fn evaluate(request: &DeckEvalRequest) -> Result<DeckEvalResult> {
    evaluate_with_progress(request, |_| ControlFlow::Continue(()))
}

/// Live deck-eval progress: unique hands are solved one at a time so `on_progress`
/// ticks after each opening hand instead of bursting at the end of a parallel batch.
/// Monte Carlo also reports per-rollout progress within each hand.
pub fn evaluate_with_serial_progress(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
) -> Result<DeckEvalResult> {
    evaluate_hands(
        request,
        on_progress,
        |_| ControlFlow::Continue(()),
        false,
        None,
    )
}

pub fn evaluate_with_progress(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
) -> Result<DeckEvalResult> {
    evaluate_hands(
        request,
        on_progress,
        |_| ControlFlow::Continue(()),
        true,
        None,
    )
}

/// Parallel deck-eval with both aggregate hand progress and per-hand
/// started / rollout / done events (for multi-bar UI).
pub fn evaluate_with_hand_progress(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
) -> Result<DeckEvalResult> {
    evaluate_hands(request, on_progress, on_hand_progress, true, None)
}

/// Like [`evaluate_with_hand_progress`], but cooperative-cancel when `cancel` is set
/// (worker sets this when the NDJSON client disconnects).
pub fn evaluate_with_hand_progress_cancel(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
    cancel: crate::cancel::CancelFlag,
) -> Result<DeckEvalResult> {
    evaluate_hands(request, on_progress, on_hand_progress, true, Some(cancel))
}

/// Parallel evaluate with a cancel flag (used by optimize so disconnect aborts
/// nested deck evals).
pub fn evaluate_with_progress_cancel(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
    cancel: crate::cancel::CancelFlag,
) -> Result<DeckEvalResult> {
    evaluate_hands(
        request,
        on_progress,
        |_| ControlFlow::Continue(()),
        true,
        Some(cancel),
    )
}

fn evaluate_hands(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
    parallel: bool,
    cancel: Option<crate::cancel::CancelFlag>,
) -> Result<DeckEvalResult> {
    let started = Instant::now();
    let budget = request.budget;
    let deck = parse_counts(&request.deck)?;
    if deck.len() < 7 {
        return Err(EngineError::invalid(
            "deck must contain at least seven recognized cards",
        ));
    }
    let max_turns = request
        .max_turns
        .clamp(budget.max_turns_min, budget.max_turns_max);
    let rollouts = request.rollouts.clamp(1, budget.max_eval_rollouts);
    let total_rollouts = if request.sim_type == SimType::MonteCarlo {
        rollouts
    } else {
        1
    };
    let mut rng = Rng::new(request.seed);

    let mut draws = Vec::with_capacity(request.samples as usize);
    for sample_index in 0..request.samples {
        let mut shuffled = deck.clone();
        shuffle_cards(&mut shuffled, &mut rng);
        let drawn = shuffled[..7].to_vec();
        draws.push(SampleDraw {
            key: hand_key(&drawn),
            drawn,
            sample_index,
        });
    }

    let mut unique = Vec::new();
    let mut seen = FxHashMap::default();
    for draw in &draws {
        let cache_key = (request.sim_type, draw.key);
        if seen.insert(cache_key, draw.sample_index).is_none() {
            unique.push((request.sim_type, draw.key, draw.sample_index));
        }
    }

    let hands_total = request.samples.max(1);
    let on_progress = Mutex::new(on_progress);
    let on_hand_progress = Mutex::new(on_hand_progress);
    if report_eval_progress(
        &on_progress,
        EvalProgress {
            sample: 0,
            total: hands_total,
            rollout: 0,
            total_rollouts,
        },
    )
    .is_break()
    {
        return Err(EngineError::Cancelled);
    }

    let cache = solve_unique_hands(
        &unique,
        request,
        &budget,
        max_turns,
        rollouts,
        &on_progress,
        &on_hand_progress,
        parallel,
        cancel,
    )?;

    let unique_solved = cache.len();
    let mut remaining_uses: FxHashMap<(SimType, [u8; CARD_COUNT]), u16> = FxHashMap::default();
    for draw in &draws {
        let cache_key = (request.sim_type, draw.key);
        if cache.contains_key(&cache_key) {
            *remaining_uses.entry(cache_key).or_insert(0) += 1;
        }
    }

    let mut hands = Vec::with_capacity(draws.len());
    let mut damages = Vec::with_capacity(draws.len());
    let mut total_nodes = 0;
    let is_two_pass = request.sim_type == SimType::TwoPass;
    let materials_mask = resolve_materials_bitmask(&request.materials);
    let mut stats_acc =
        crate::stats::DeckStatAccumulator::with_deck_and_materials(&deck, materials_mask);
    let mut brick_stats_acc =
        crate::stats::DeckStatAccumulator::with_deck_and_materials(&deck, materials_mask);
    let mut oracle_stats_acc =
        crate::stats::DeckStatAccumulator::with_deck_and_materials(&deck, materials_mask);

    let mut cache = cache;
    for draw in &draws {
        let cache_key = (request.sim_type, draw.key);
        if !remaining_uses.contains_key(&cache_key) {
            continue;
        }
        let last = remaining_uses
            .get_mut(&cache_key)
            .map(|n| {
                *n = n.saturating_sub(1);
                *n == 0
            })
            .unwrap_or(true);
        let mut sample = if last {
            cache.remove(&cache_key).expect("solved draw key stays in cache")
        } else {
            cache
                .get(&cache_key)
                .cloned()
                .expect("solved draw key stays in cache")
        };
        sample.hand = draw.drawn.iter().map(|card| card.id()).collect();
        total_nodes += sample.nodes;
        damages.push(sample.damage);
        if is_two_pass {
            if let Some(brick_line) = sample.brick_line_stats.as_ref() {
                brick_stats_acc.add_sample(&draw.drawn, brick_line);
                stats_acc.add_sample(&draw.drawn, brick_line);
            }
            oracle_stats_acc.add_sample(&draw.drawn, &sample.line_stats);
            stats_acc.add_sample(&draw.drawn, &sample.line_stats);
        } else {
            stats_acc.add_sample(&draw.drawn, &sample.line_stats);
        }
        stats_acc.add_hand_outcome(&draw.drawn, sample.damage);
        hands.push(sample);
    }

    if report_eval_progress(
        &on_progress,
        EvalProgress {
            sample: request.samples,
            total: hands_total,
            rollout: 0,
            total_rollouts,
        },
    )
    .is_break()
    {
        return Err(EngineError::Cancelled);
    }

    let mut sorted = damages.clone();
    sorted.sort_unstable();
    let mean =
        damages.iter().map(|&value| f64::from(value)).sum::<f64>() / damages.len().max(1) as f64;
    let mean_end_influence = hands
        .iter()
        .map(|hand| f64::from(hand.end_influence))
        .sum::<f64>()
        / hands.len().max(1) as f64;
    let sample_count = damages.len();
    if sample_count == 0 {
        return Err(EngineError::invalid(
            "every opening hand exceeded the max duration",
        ));
    }
    let timed_out_samples = usize::from(request.samples).saturating_sub(sample_count);
    Ok(DeckEvalResult {
        sim_type: request.sim_type,
        samples: damages.len(),
        damages,
        hands,
        mean,
        p10: percentile(&sorted, 10),
        p50: percentile(&sorted, 50),
        p90: percentile(&sorted, 90),
        max: sorted.last().copied().unwrap_or(0),
        min: sorted.first().copied().unwrap_or(0),
        mean_end_influence,
        unique_hands: unique_solved,
        states_searched: total_nodes,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: EffectiveRequest {
            root_seed: request.seed,
            sim_type: Some(request.sim_type),
            deck: request.deck.clone(),
            go_first: Some(request.go_first),
            max_turns: Some(max_turns),
            rollouts: Some(rollouts),
            samples: Some(u16::try_from(sample_count).unwrap_or(u16::MAX)),
            budget,
            max_threads: request.max_threads,
            glimpse_enabled: request.glimpse_enabled,
            max_hand_duration_secs: request.max_hand_duration_secs,
            max_card_draw: request.max_card_draw,
            ..Default::default()
        },
        card_stats: stats_acc.finish(),
        brick_card_stats: if is_two_pass {
            brick_stats_acc.finish()
        } else {
            Vec::new()
        },
        oracle_card_stats: if is_two_pass {
            oracle_stats_acc.finish()
        } else {
            Vec::new()
        },
        timed_out_samples,
    })
}

pub fn optimize(request: &OptimizeRequest) -> Result<OptimizeResult> {
    optimize_with_progress(request, |_| ControlFlow::Continue(()))
}

/// Number of legal count vectors inside `bounds` that sum to `deck_size`.
pub fn count_legal_decks(bounds: &BTreeMap<String, Bounds>, deck_size: u8) -> Result<u64> {
    validate_bounds(bounds, deck_size)?;
    let ranges = bounds
        .values()
        .map(|bound| (bound.min, bound.max))
        .collect::<Vec<_>>();
    Ok(count_compositions(&ranges, deck_size))
}

pub fn optimize_with_progress(
    request: &OptimizeRequest,
    on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    crate::optimize_strategies::optimize_with_progress(request, on_progress)
}

/// Like [`optimize_with_progress`], plus per-hand started / rollout / done events
/// for the multi-bar UI (same events deck-eval streams).
pub fn optimize_with_hand_progress(
    request: &OptimizeRequest,
    on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    crate::optimize_strategies::optimize_with_hand_progress(
        request,
        on_progress,
        on_hand_progress,
    )
}

pub(crate) fn counts_key(counts: &BTreeMap<String, u8>) -> Vec<u8> {
    counts.values().copied().collect()
}

fn validate_bounds(bounds: &BTreeMap<String, Bounds>, deck_size: u8) -> Result<()> {
    if bounds.is_empty() {
        return Err(EngineError::invalid(
            "bounds must include at least one card",
        ));
    }
    for id in bounds.keys() {
        crate::cards::parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone()))?;
    }
    let min_total: u16 = bounds.values().map(|bound| u16::from(bound.min)).sum();
    let max_total: u16 = bounds.values().map(|bound| u16::from(bound.max)).sum();
    if u16::from(deck_size) < min_total || u16::from(deck_size) > max_total {
        return Err(EngineError::invalid(format!(
            "deck size must be between bound totals {min_total} and {max_total}"
        )));
    }
    for bound in bounds.values() {
        if bound.min > bound.max {
            return Err(EngineError::invalid("each card minimum must be <= maximum"));
        }
    }
    Ok(())
}

fn count_compositions(ranges: &[(u8, u8)], deck_size: u8) -> u64 {
    let size = deck_size as usize;
    let mut dp = vec![0_u64; size + 1];
    dp[0] = 1;
    for &(lo, hi) in ranges {
        let mut prefix = vec![0_u128; size + 2];
        for index in 0..=size {
            prefix[index + 1] = prefix[index] + u128::from(dp[index]);
        }
        let mut next = vec![0_u64; size + 1];
        for (sum, slot) in next.iter_mut().enumerate() {
            let right = sum as isize - isize::from(lo);
            let left = sum as isize - isize::from(hi);
            if right < 0 {
                continue;
            }
            let left = left.max(0) as usize;
            let right = (right as usize).min(size);
            if left <= right {
                let total = prefix[right + 1] - prefix[left];
                *slot = u64::try_from(total).unwrap_or(u64::MAX);
            }
        }
        dp = next;
    }
    dp[size]
}

pub(crate) fn consider_top(
    top: &mut Vec<(f64, BTreeMap<String, u8>, Vec<crate::stats::CardStat>)>,
    score: f64,
    counts: &BTreeMap<String, u8>,
    card_stats: Vec<crate::stats::CardStat>,
) {
    if let Some(existing) = top.iter_mut().find(|(_, known, _)| known == counts) {
        if score > existing.0 {
            existing.0 = score;
            existing.2 = card_stats;
            top.sort_by(|left, right| {
                right
                    .0
                    .partial_cmp(&left.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        return;
    }
    if top.len() < 5 || top.last().is_some_and(|(worst, _, _)| score > *worst) {
        top.push((score, counts.clone(), card_stats));
        top.sort_by(|left, right| {
            right
                .0
                .partial_cmp(&left.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        top.truncate(5);
    }
}

pub(crate) fn ranked_decks(
    top: &[(f64, BTreeMap<String, u8>, Vec<crate::stats::CardStat>)],
) -> Vec<RankedDeck> {
    top.iter()
        .enumerate()
        .map(|(index, (score, counts, card_stats))| RankedDeck {
            rank: (index + 1) as u8,
            score: *score,
            counts: counts.clone(),
            score_delta: None,
            card_stats: card_stats.clone(),
            candidate: None,
        })
        .collect()
}

fn parse_counts(counts: &BTreeMap<String, u8>) -> Result<Vec<Card>> {
    let mut deck = Vec::new();
    for (id, &count) in counts {
        let card =
            crate::cards::parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone()))?;
        deck.extend(std::iter::repeat_n(card, count as usize));
    }
    Ok(deck)
}

pub(crate) fn initial_counts(
    bounds: &BTreeMap<String, Bounds>,
    deck_size: u8,
    rng: &mut Rng,
) -> Result<BTreeMap<String, u8>> {
    validate_bounds(bounds, deck_size)?;
    let min_total: u16 = bounds.values().map(|bound| u16::from(bound.min)).sum();
    let mut counts = bounds
        .iter()
        .map(|(id, bound)| (id.clone(), bound.min))
        .collect::<BTreeMap<_, _>>();
    let ids = bounds.keys().cloned().collect::<Vec<_>>();
    let mut remaining = u16::from(deck_size) - min_total;
    while remaining > 0 {
        let expandable = ids
            .iter()
            .filter(|id| counts[*id] < bounds[*id].max)
            .collect::<Vec<_>>();
        let id = expandable[rng.index(expandable.len())];
        *counts.get_mut(id).expect("bound id exists") += 1;
        remaining -= 1;
    }
    Ok(counts)
}

pub use crate::model::Bounds;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deck_evaluation_is_deterministic() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
        ]);
        let request = DeckEvalRequest {
            deck,
            samples: 2,
            go_first: true,
            max_turns: 2,
            seed: 9,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        };
        let one = evaluate(&request).unwrap();
        let two = evaluate(&request).unwrap();
        assert_eq!(one.damages, two.damages);
        assert!(one.p10 <= one.p50);
        assert!(one.p50 <= one.p90);
        assert!(one.mean_end_influence >= 0.0);
        assert_eq!(one.effective.root_seed, 9);
        assert_eq!(one.effective.max_turns, Some(2));
        assert_eq!(one.effective.rollouts, Some(1));
        assert_eq!(one.effective.samples, Some(2));
        assert_eq!(one.effective.engine_version, two.effective.engine_version);
    }

    #[test]
    fn optimizer_preserves_deck_size() {
        let result = optimize(&OptimizeRequest {
            bounds: BTreeMap::from([
                ("arthur".into(), Bounds { min: 1, max: 3 }),
                ("kingdom_informant".into(), Bounds { min: 1, max: 3 }),
                ("clumsy_apprentice".into(), Bounds { min: 1, max: 3 }),
            ]),
            deck_size: 7,
            samples: 1,
            decks: 4,
            metric: Metric::Mean,
            seed: 4,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            strategy: Strategy::RandomSample,
            base_deck: BTreeMap::new(),
            swap: None,
            multi_deck: None,
            go_first: true,
            max_turns: 3,
            sim_type: crate::model::SimType::FireBrick,
            rollouts: 1,
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,
            max_card_draw: None,
        })
        .unwrap();
        assert_eq!(
            result
                .best_counts
                .values()
                .map(|&count| u16::from(count))
                .sum::<u16>(),
            7
        );
        assert!(result.decks_scored >= 1);
        assert!(result.legal_decks >= result.decks_scored as u64);
        assert_eq!(result.effective.decks, Some(4));
        assert_eq!(result.effective.deck_size, Some(7));
        assert_eq!(result.effective.samples, Some(1));
        assert_eq!(result.effective.metric, Some("mean"));
    }

    #[test]
    fn evaluate_clamps_turns_and_rollouts() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
        ]);
        let result = evaluate(&DeckEvalRequest {
            deck,
            samples: 1,
            go_first: true,
            max_turns: 1,
            seed: 3,
            sim_type: SimType::FireBrick,
            rollouts: 0,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .unwrap();
        assert_eq!(result.effective.max_turns, Some(2));
        assert_eq!(result.effective.rollouts, Some(1));
    }

    #[test]
    fn parallel_eval_matches_serial_results() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let request = DeckEvalRequest {
            deck,
            samples: 8,
            go_first: true,
            max_turns: 2,
            seed: 17,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        };
        let serial =
            evaluate_with_serial_progress(&request, |_| ControlFlow::Continue(())).unwrap();
        let parallel = evaluate_with_progress(&request, |_| ControlFlow::Continue(())).unwrap();
        assert_eq!(serial.damages, parallel.damages);
        assert_eq!(serial.mean, parallel.mean);
        assert_eq!(serial.p50, parallel.p50);
        assert_eq!(serial.unique_hands, parallel.unique_hands);
    }

    #[test]
    fn parallel_progress_is_monotonic_and_reaches_total() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let mut ticks = Vec::new();
        let result = evaluate_with_progress(
            &DeckEvalRequest {
                deck,
                samples: 6,
                go_first: true,
                max_turns: 2,
                seed: 21,
                sim_type: SimType::FireBrick,
                rollouts: 1,
                budget: crate::budget::Budget::default(),
                materials: BTreeMap::new(),
                max_threads: None,
                glimpse_enabled: None,
                max_hand_duration_secs: None,

            max_card_draw: None,
            },
            |progress| {
                ticks.push(progress);
                ControlFlow::Continue(())
            },
        )
        .unwrap();
        assert_eq!(result.samples, 6);
        let hand_ticks: Vec<_> = ticks
            .iter()
            .filter(|tick| tick.rollout == 0)
            .map(|tick| tick.sample)
            .collect();
        assert!(
            hand_ticks.windows(2).all(|pair| pair[0] <= pair[1]),
            "expected monotonic hand progress, got {hand_ticks:?}"
        );
        assert_eq!(
            hand_ticks.last().copied(),
            Some(6),
            "expected final hand progress to reach total, got {hand_ticks:?}"
        );
    }

    #[test]
    fn parallel_monte_carlo_reports_hand_progress_only() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let mut ticks = Vec::new();
        let result = evaluate_with_progress(
            &DeckEvalRequest {
                deck,
                samples: 2,
                go_first: true,
                max_turns: 2,
                seed: 13,
                sim_type: SimType::MonteCarlo,
                rollouts: 3,
                budget: crate::budget::Budget {
                    max_eval_rollouts: 3,
                    ..crate::budget::Budget::default()
                },
                materials: BTreeMap::new(),
                max_threads: None,
                glimpse_enabled: None,
                max_hand_duration_secs: None,

            max_card_draw: None,
            },
            |progress| {
                ticks.push(progress);
                ControlFlow::Continue(())
            },
        )
        .unwrap();
        assert_eq!(result.effective.rollouts, Some(3));
        assert!(
            ticks.iter().all(|tick| tick.rollout == 0),
            "parallel MC should not emit rollout ticks, got {ticks:?}"
        );
        assert!(
            ticks.iter().any(|tick| tick.sample == 1 && tick.total == 2),
            "expected a completed-hand tick, got {ticks:?}"
        );
    }

    #[test]
    fn monte_carlo_serial_progress_reports_rollouts() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let mut ticks = Vec::new();
        let result = evaluate_with_serial_progress(
            &DeckEvalRequest {
                deck,
                samples: 1,
                go_first: true,
                max_turns: 2,
                seed: 11,
                sim_type: SimType::MonteCarlo,
                rollouts: 3,
                budget: crate::budget::Budget {
                    max_eval_rollouts: 3,
                    ..crate::budget::Budget::default()
                },
                materials: BTreeMap::new(),
                max_threads: None,
                glimpse_enabled: None,
                max_hand_duration_secs: None,

            max_card_draw: None,
            },
            |progress| {
                ticks.push(progress);
                ControlFlow::Continue(())
            },
        )
        .unwrap();
        assert_eq!(result.effective.rollouts, Some(3));
        assert!(
            ticks
                .iter()
                .any(|tick| tick.rollout == 1 && tick.total_rollouts == 3),
            "expected a mid-hand rollout tick, got {ticks:?}"
        );
        assert!(
            ticks
                .iter()
                .any(|tick| tick.rollout == 3 && tick.total_rollouts == 3),
            "expected a final-rollout tick, got {ticks:?}"
        );
        assert!(
            ticks.iter().any(|tick| tick.sample == 1 && tick.total == 1),
            "expected a completed-hand tick, got {ticks:?}"
        );
    }

    #[test]
    fn parallel_monte_carlo_emits_per_hand_progress() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let mut hand_ticks = Vec::new();
        let result = evaluate_with_hand_progress(
            &DeckEvalRequest {
                deck,
                samples: 2,
                go_first: true,
                max_turns: 2,
                seed: 13,
                sim_type: SimType::MonteCarlo,
                rollouts: 3,
                budget: crate::budget::Budget {
                    max_eval_rollouts: 3,
                    ..crate::budget::Budget::default()
                },
                materials: BTreeMap::new(),
                max_threads: None,
                glimpse_enabled: None,
                max_hand_duration_secs: None,

            max_card_draw: None,
            },
            |_| ControlFlow::Continue(()),
            |progress| {
                hand_ticks.push(progress);
                ControlFlow::Continue(())
            },
        )
        .unwrap();
        assert_eq!(result.effective.rollouts, Some(3));
        let unique_indexes: std::collections::BTreeSet<_> =
            hand_ticks.iter().map(|tick| tick.sample_index).collect();
        assert!(
            !unique_indexes.is_empty(),
            "expected at least one hand progress sample_index"
        );
        for &index in &unique_indexes {
            let for_hand: Vec<_> = hand_ticks
                .iter()
                .filter(|tick| tick.sample_index == index)
                .copied()
                .collect();
            assert_eq!(
                for_hand.first().map(|tick| tick.phase),
                Some(HandPhase::Started),
                "hand {index} should start with Started, got {for_hand:?}"
            );
            assert_eq!(
                for_hand.last().map(|tick| tick.phase),
                Some(HandPhase::Done),
                "hand {index} should end with Done, got {for_hand:?}"
            );
            let rollouts: Vec<_> = for_hand
                .iter()
                .filter(|tick| tick.phase == HandPhase::Rollout)
                .map(|tick| tick.rollout)
                .collect();
            assert_eq!(
                rollouts,
                vec![1, 2, 3],
                "hand {index} rollouts: {rollouts:?}"
            );
        }
        let done_count = hand_ticks
            .iter()
            .filter(|tick| tick.phase == HandPhase::Done)
            .count();
        assert_eq!(done_count, unique_indexes.len());
    }

    #[test]
    fn deck_eval_omits_per_rollout_event_tapes() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let result = evaluate_with_progress(
            &DeckEvalRequest {
                deck: deck.clone(),
                samples: 2,
                go_first: true,
                max_turns: 2,
                seed: 13,
                sim_type: SimType::MonteCarlo,
                rollouts: 3,
                budget: crate::budget::Budget {
                    max_eval_rollouts: 3,
                    ..crate::budget::Budget::default()
                },
                materials: BTreeMap::new(),
                max_threads: None,
                glimpse_enabled: None,
                max_hand_duration_secs: None,

            max_card_draw: None,
            },
            |_| ControlFlow::Continue(()),
        )
        .unwrap();
        for hand in &result.hands {
            let dist = hand.distribution.as_ref().expect("MC distribution");
            assert_eq!(dist.rollouts.len(), 3);
            assert!(
                dist.rollouts
                    .iter()
                    .all(|rollout| rollout.events.is_empty()),
                "deck eval should drop per-rollout tapes"
            );
            assert!(
                !hand.events.is_empty(),
                "P50 headline tape should still be present"
            );
            assert_eq!(dist.damages.len(), 3);
        }

        let solve = crate::solve(&SolveRequest {
            hand: result.hands[0]
                .hand
                .iter()
                .map(|id| (*id).to_string())
                .collect(),
            go_first: true,
            max_turns: 2,
            sim_type: SimType::MonteCarlo,
            deck,
            queue: None,
            rollouts: 3,
            seed: 13,
            budget: crate::budget::Budget {
                max_solve_rollouts: 3,
                ..crate::budget::Budget::default()
            },
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .unwrap();
        let dist = solve.distribution.as_ref().expect("MC distribution");
        assert!(
            dist.rollouts
                .iter()
                .any(|rollout| !rollout.events.is_empty()),
            "hand solve should retain per-rollout tapes"
        );
    }

    #[test]
    fn card_stats_expose_damage_when_seen_sum() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
        ]);
        let result = evaluate(&DeckEvalRequest {
            deck,
            samples: 4,
            go_first: true,
            max_turns: 2,
            seed: 11,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .unwrap();
        for stat in &result.card_stats {
            if stat.seen > 0 {
                assert_eq!(
                    stat.damage_when_seen,
                    f64::from(stat.damage_when_seen_sum) / f64::from(stat.seen)
                );
            } else {
                assert_eq!(stat.damage_when_seen_sum, 0);
            }
            let buckets = stat.with_hand_samples + stat.without_hand_samples;
            if buckets > 0 {
                assert_eq!(buckets, result.samples as u32);
            }
        }
    }

    #[test]
    fn heavy_hand_threads_are_capped_by_memory_budget() {
        // Max heavy hands is derived from total/reserve/hand_mem; Fire Brick
        // still gets the full CPU count.
        let heavy = hand_threads(SimType::MonteCarlo);
        assert!(heavy >= 1);
        assert!(heavy <= requested_threads());
        assert_eq!(hand_threads(SimType::FireBrick), requested_threads());
        assert_eq!(hand_threads(SimType::OracleOnly), heavy);
        assert_eq!(hand_threads(SimType::TwoPass), heavy);
    }

    #[test]
    fn duplicate_opening_hands_keep_independent_sample_records() {
        let deck = BTreeMap::from([
            ("arthur".into(), 7),
            ("kingdom_informant".into(), 1),
            ("clumsy_apprentice".into(), 1),
        ]);
        let result = evaluate(&DeckEvalRequest {
            deck,
            samples: 8,
            go_first: true,
            max_turns: 1,
            seed: 1,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .unwrap();
        assert_eq!(result.hands.len(), 8);
        // A 9-card deck with 7 Arthur copies repeats opening hands; each
        // sample still carries its own drawn-card list.
        for sample in &result.hands {
            assert_eq!(sample.hand.len(), 7);
        }
    }

    #[test]
    fn serial_evaluate_save_keeps_finished_hands() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let request = DeckEvalRequest {
            deck,
            samples: 8,
            go_first: true,
            max_turns: 2,
            seed: 17,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        };
        let flag = crate::cancel::new_flag();
        let result = evaluate_hands(
            &request,
            |progress| {
                if progress.sample >= 2 {
                    crate::cancel::request_save(&flag);
                }
                ControlFlow::Continue(())
            },
            |_| ControlFlow::Continue(()),
            false,
            Some(flag.clone()),
        )
        .unwrap();
        assert!(result.samples >= 2);
        assert!(result.samples < 8);
        assert_eq!(result.hands.len(), result.samples);
        assert_eq!(result.damages.len(), result.samples);
    }

    #[test]
    fn serial_evaluate_hard_cancel_discards_hands() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let flag = crate::cancel::new_flag();
        let error = evaluate_hands(
            &DeckEvalRequest {
                deck,
                samples: 8,
                go_first: true,
                max_turns: 2,
                seed: 17,
                sim_type: SimType::FireBrick,
                rollouts: 1,
                budget: crate::budget::Budget::default(),
                materials: BTreeMap::new(),
                max_threads: None,
                glimpse_enabled: None,
                max_hand_duration_secs: None,

            max_card_draw: None,
            },
            |progress| {
                if progress.sample >= 2 {
                    crate::cancel::request(&flag);
                }
                ControlFlow::Continue(())
            },
            |_| ControlFlow::Continue(()),
            false,
            Some(flag.clone()),
        )
        .expect_err("hard cancel should discard finished hands");
        assert!(matches!(error, EngineError::Cancelled));
    }

    #[test]
    fn truncate_draw_queue_caps_known_draws() {
        use crate::model::truncate_draw_queue;
        let queue = vec![
            Card::Arthur,
            Card::RedHare,
            Card::MarchHare,
            Card::BlazingThrow,
        ];
        assert_eq!(truncate_draw_queue(queue.clone(), None).len(), 4);
        assert_eq!(truncate_draw_queue(queue.clone(), Some(0)).len(), 4);
        assert_eq!(truncate_draw_queue(queue.clone(), Some(2)).len(), 2);
        assert_eq!(
            truncate_draw_queue(queue, Some(2)),
            vec![Card::Arthur, Card::RedHare]
        );
    }

    #[test]
    fn effective_glimpse_forces_off_for_fire_brick() {
        use crate::model::effective_glimpse;
        assert!(!effective_glimpse(SimType::FireBrick, false, Some(true)));
        assert!(!effective_glimpse(SimType::TwoPass, true, Some(true)));
        assert!(effective_glimpse(SimType::OracleOnly, false, None));
        assert!(!effective_glimpse(SimType::OracleOnly, false, Some(false)));
    }

    #[test]
    fn deck_eval_accounts_for_timed_out_samples() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let outcome = evaluate(&DeckEvalRequest {
            deck,
            samples: 4,
            go_first: true,
            max_turns: 3,
            seed: 17,
            sim_type: SimType::OracleOnly,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: Some(1),
            max_card_draw: None,
        });
        match outcome {
            Ok(result) => {
                assert_eq!(result.samples + result.timed_out_samples, 4);
            }
            Err(EngineError::InvalidRequest(_)) => {}
            Err(other) => panic!("unexpected evaluate error: {other}"),
        }
    }

    #[test]
    fn deck_eval_all_hands_timeout_errors() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
            ("sable_remnant".into(), 2),
            ("blazing_throw".into(), 2),
            ("red_hare".into(), 2),
            ("march_hare".into(), 2),
        ]);
        let error = evaluate(&DeckEvalRequest {
            deck,
            samples: 2,
            go_first: true,
            max_turns: 3,
            seed: 17,
            sim_type: SimType::OracleOnly,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: Some(1),
            max_card_draw: None,
        })
        .unwrap_err();
        assert!(matches!(error, EngineError::InvalidRequest(_)));
    }
}
