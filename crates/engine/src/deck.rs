use crate::{
    cards::{CARD_COUNT, Card},
    line_event::LineEvent,
    model::{
        DamageDistribution, EffectiveRequest, SimType, SolveRequest, TwoPassResult,
        resolve_materials_bitmask,
    },
    solver::solve_with_progress,
    version::ENGINE_VERSION,
};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};

#[cfg(feature = "ts")]
use ts_rs::TS;

use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::time::Instant;

use rayon::prelude::*;

/// Observed peak RSS for one Monte Carlo / oracle hand is ~2–3 GiB on full
/// queues. Cap concurrent heavy hands so 16 GiB machines stay alive.
const MB_PER_HEAVY_HAND: u64 = 3072;

fn mem_available_mb() -> Option<u64> {
    let status = std::fs::read_to_string("/proc/meminfo").ok()?;
    for line in status.lines() {
        let Some(rest) = line.strip_prefix("MemAvailable:") else {
            continue;
        };
        let kb: u64 = rest.split_whitespace().next()?.parse().ok()?;
        return Some(kb / 1024);
    }
    None
}

fn sim_uses_heavy_search(sim_type: SimType) -> bool {
    matches!(
        sim_type,
        SimType::MonteCarlo | SimType::OracleOnly | SimType::TwoPass
    )
}

/// Hand parallelism for deck eval. `RAYON_NUM_THREADS` is an upper bound.
/// Monte Carlo / Oracle / Two-pass are also capped by free RAM.
pub fn hand_threads(sim_type: SimType) -> usize {
    let cpus = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let requested = std::env::var("RAYON_NUM_THREADS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(cpus);
    hand_threads_with(sim_type, requested, mem_available_mb())
}

/// Pure core of [`hand_threads`], split out so tests stay off process env.
fn hand_threads_with(sim_type: SimType, requested: usize, mem_available: Option<u64>) -> usize {
    if !sim_uses_heavy_search(sim_type) {
        return requested;
    }
    let by_ram = mem_available
        .map(|mb| usize::try_from((mb / MB_PER_HEAVY_HAND).max(1)).unwrap_or(1))
        .unwrap_or(1);
    requested.min(by_ram)
}

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

/// Shared read-only inputs for solving sampled hands. Grouping them keeps the
/// per-hand call sites readable and under the argument-count lint.
struct SampleContext<'a, F: FnMut(EvalProgress) -> ControlFlow<()> + Send> {
    request: &'a DeckEvalRequest,
    budget: &'a crate::budget::Budget,
    max_turns: u8,
    rollouts: u16,
    hands_total: u16,
    on_progress: &'a Mutex<F>,
    report_in_hand_progress: bool,
}

fn solve_sample_hand(
    drawn: &[Card],
    sample_index: u16,
    hands_done: u16,
    ctx: &SampleContext<'_, impl FnMut(EvalProgress) -> ControlFlow<()> + Send>,
) -> Result<SampleHand, String> {
    let request = ctx.request;
    let total_rollouts = if request.sim_type == SimType::MonteCarlo {
        ctx.rollouts
    } else {
        1
    };
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
        return Err("cancelled".into());
    }
    let hand_ids = drawn.iter().map(|card| card.id().to_string()).collect();
    let result = solve_with_progress(
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
        },
        |rollout, total_rollouts| {
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
    ctx: &SampleContext<'_, impl FnMut(EvalProgress) -> ControlFlow<()> + Send>,
) -> Result<((SimType, [u8; CARD_COUNT]), SampleHand), String> {
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

fn solve_unique_hands(
    unique: &[(SimType, [u8; CARD_COUNT], u16)],
    request: &DeckEvalRequest,
    budget: &crate::budget::Budget,
    max_turns: u8,
    rollouts: u16,
    on_progress: &Mutex<impl FnMut(EvalProgress) -> ControlFlow<()> + Send>,
    parallel: bool,
) -> Result<FxHashMap<(SimType, [u8; CARD_COUNT]), SampleHand>, String> {
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
        report_in_hand_progress,
    };
    if !parallel {
        let mut cache = FxHashMap::default();
        for (index, &(sim_type, key, sample_index)) in unique.iter().enumerate() {
            let hands_done = u16::try_from(index).unwrap_or(u16::MAX);
            let (cache_key, sample) =
                solve_one_unique_hand(sim_type, key, sample_index, hands_done, &ctx)?;
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
                return Err("cancelled".into());
            }
        }
        return Ok(cache);
    }

    let completed = AtomicU16::new(0);
    let cancelled = AtomicBool::new(false);
    let threads = hand_threads(request.sim_type);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .build()
        .map_err(|err| format!("rayon pool: {err}"))?;
    // map + collect into Result short-circuits on the first failure, so real
    // errors (e.g. unknown card) propagate instead of collapsing into
    // "cancelled".
    let cache = pool.install(|| {
        unique
            .par_iter()
            .map(|&(sim_type, key, sample_index)| {
                if cancelled.load(Ordering::Relaxed) {
                    return Err("cancelled".into());
                }
                let hands_done = completed.load(Ordering::Relaxed);
                let (cache_key, sample) =
                    solve_one_unique_hand(sim_type, key, sample_index, hands_done, &ctx)?;
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
                    return Err("cancelled".into());
                }
                Ok((cache_key, sample))
            })
            .collect::<Result<FxHashMap<_, _>, String>>()
    })?;
    Ok(cache)
}

#[derive(Clone, Copy)]
pub(crate) struct Rng(u64);

impl Rng {
    pub(crate) fn new(seed: u64) -> Self {
        Self(seed)
    }

    pub(crate) fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^ (z >> 31)
    }

    pub(crate) fn index(&mut self, len: usize) -> usize {
        (self.next() as usize) % len
    }
}

pub fn evaluate(request: &DeckEvalRequest) -> Result<DeckEvalResult, String> {
    evaluate_with_progress(request, |_| ControlFlow::Continue(()))
}

/// Live deck-eval progress: unique hands are solved one at a time so `on_progress`
/// ticks after each opening hand instead of bursting at the end of a parallel batch.
/// Monte Carlo also reports per-rollout progress within each hand.
pub fn evaluate_with_serial_progress(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
) -> Result<DeckEvalResult, String> {
    evaluate_hands(request, on_progress, false)
}

pub fn evaluate_with_progress(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
) -> Result<DeckEvalResult, String> {
    evaluate_hands(request, on_progress, true)
}

fn evaluate_hands(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
    parallel: bool,
) -> Result<DeckEvalResult, String> {
    let started = Instant::now();
    let budget = request.budget;
    let deck = parse_counts(&request.deck)?;
    if deck.len() < 7 {
        return Err("deck must contain at least seven recognized cards".into());
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
        shuffle(&mut shuffled, &mut rng);
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
        return Err("cancelled".into());
    }

    let cache = solve_unique_hands(
        &unique,
        request,
        &budget,
        max_turns,
        rollouts,
        &on_progress,
        parallel,
    )?;

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

    for draw in &draws {
        let cache_key = (request.sim_type, draw.key);
        let mut sample = cache
            .get(&cache_key)
            .cloned()
            .expect("every draw key was solved");
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
        return Err("cancelled".into());
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
        unique_hands: cache.len(),
        states_searched: total_nodes,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: EffectiveRequest {
            engine_version: ENGINE_VERSION,
            root_seed: request.seed,
            sim_type: Some(request.sim_type),
            deck: request.deck.clone(),
            go_first: Some(request.go_first),
            max_turns: Some(max_turns),
            rollouts: Some(rollouts),
            samples: Some(request.samples),
            metric: None,
            bounds: BTreeMap::new(),
            deck_size: None,
            decks: None,
            strategy: None,
            budget,
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
    })
}

pub fn optimize(request: &OptimizeRequest) -> Result<OptimizeResult, String> {
    optimize_with_progress(request, |_| ControlFlow::Continue(()))
}

/// Number of legal count vectors inside `bounds` that sum to `deck_size`.
pub fn count_legal_decks(bounds: &BTreeMap<String, Bounds>, deck_size: u8) -> Result<u64, String> {
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
) -> Result<OptimizeResult, String> {
    crate::optimize_strategies::optimize_with_progress(request, on_progress)
}

pub(crate) fn counts_key(counts: &BTreeMap<String, u8>) -> Vec<u8> {
    counts.values().copied().collect()
}

fn validate_bounds(bounds: &BTreeMap<String, Bounds>, deck_size: u8) -> Result<(), String> {
    if bounds.is_empty() {
        return Err("bounds must include at least one card".into());
    }
    for id in bounds.keys() {
        crate::cards::parse_card(id).ok_or_else(|| format!("unknown card: {id}"))?;
    }
    let min_total: u16 = bounds.values().map(|bound| u16::from(bound.min)).sum();
    let max_total: u16 = bounds.values().map(|bound| u16::from(bound.max)).sum();
    if u16::from(deck_size) < min_total || u16::from(deck_size) > max_total {
        return Err(format!(
            "deck size must be between bound totals {min_total} and {max_total}"
        ));
    }
    for bound in bounds.values() {
        if bound.min > bound.max {
            return Err("each card minimum must be <= maximum".into());
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

fn parse_counts(counts: &BTreeMap<String, u8>) -> Result<Vec<Card>, String> {
    let mut deck = Vec::new();
    for (id, &count) in counts {
        let card = crate::cards::parse_card(id).ok_or_else(|| format!("unknown card: {id}"))?;
        deck.extend(std::iter::repeat_n(card, count as usize));
    }
    Ok(deck)
}

pub(crate) fn initial_counts(
    bounds: &BTreeMap<String, Bounds>,
    deck_size: u8,
    rng: &mut Rng,
) -> Result<BTreeMap<String, u8>, String> {
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

fn shuffle(values: &mut [Card], rng: &mut Rng) {
    for index in (1..values.len()).rev() {
        values.swap(index, rng.index(index + 1));
    }
}

fn percentile(sorted: &[u8], percentile: usize) -> u8 {
    if sorted.is_empty() {
        return 0;
    }
    let index = ((percentile * sorted.len()) / 100).min(sorted.len() - 1);
    sorted[index]
}

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
        }
    }

    #[test]
    fn heavy_hand_threads_are_capped_by_available_ram() {
        // 4 GiB free allows one heavy hand; 8 GiB allows two.
        assert_eq!(hand_threads_with(SimType::MonteCarlo, 8, Some(4096)), 1);
        assert_eq!(hand_threads_with(SimType::MonteCarlo, 8, Some(8192)), 2);
        assert_eq!(hand_threads_with(SimType::OracleOnly, 8, Some(4096)), 1);
        assert_eq!(hand_threads_with(SimType::TwoPass, 8, Some(8192)), 2);
        // Unknown memory (non-Linux) falls back to a single heavy hand.
        assert_eq!(hand_threads_with(SimType::MonteCarlo, 8, None), 1);
        // Light sims are never RAM-capped.
        assert_eq!(hand_threads_with(SimType::FireBrick, 8, Some(1)), 8);
        assert_eq!(hand_threads_with(SimType::FireBrick, 8, None), 8);
    }
}
