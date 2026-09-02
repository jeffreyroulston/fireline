//! Deck evaluation pipeline: sampling, caching, and hand parallelism.

use crate::cards::{CARD_COUNT, Card};
use crate::error::{EngineError, Result};
use crate::model::{
    EffectiveRequest, SimType, SolveRequest, hand_duration, resolve_materials_bitmask,
};
use crate::random::{Rng, percentile, shuffle_cards};
use crate::solver::solve_for_deck_eval;
use rayon::prelude::*;
use rustc_hash::FxHashMap;
use std::ops::ControlFlow;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::time::Instant;

use super::bounds::parse_counts;
use super::pool::requested_threads;
use super::pool::{
    JobSemaphore, THROTTLE_GRACE, job_thread_cap, shared_pool, sim_uses_heavy_search,
};
use super::types::*;

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
///
/// # Errors
///
/// Returns [`EngineError::InvalidRequest`] when the deck has fewer than seven cards.
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
    let _deadline_guard =
        hand_duration(ctx.request.max_hand_duration_secs).map(crate::deadline::install);
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
            deck_number: 0,
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
                        deck_number: 0,
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
            deck_number: 0,
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
                                deck_number: 0,
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
                                deck_number: 0,
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
                                deck_number: 0,
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

/// Evaluate a deck composition by sampling opening hands and solving each one.
///
/// # Errors
///
/// Returns [`EngineError::UnknownDeckCard`] for unrecognized deck entries,
/// [`EngineError::InvalidRequest`] when bounds or deck size are invalid,
/// [`EngineError::Cancelled`] when cancelled through a progress callback, or
/// [`EngineError::HandTimeout`] when a per-hand deadline is exceeded.
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
    evaluate_hands(
        request,
        on_progress,
        on_hand_progress,
        true,
        None,
        None,
    )
}

/// Evaluate a contiguous window of opening-hand samples from the deck's fixed draw sequence.
pub(crate) fn evaluate_with_hand_progress_range(
    request: &DeckEvalRequest,
    sample_start: u16,
    sample_end: u16,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
) -> Result<DeckEvalResult> {
    evaluate_hands(
        request,
        on_progress,
        on_hand_progress,
        true,
        None,
        Some((sample_start, sample_end)),
    )
}

/// Like [`evaluate_with_hand_progress`], but cooperative-cancel when `cancel` is set
/// (worker sets this when the NDJSON client disconnects).
pub fn evaluate_with_hand_progress_cancel(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
    cancel: crate::cancel::CancelFlag,
) -> Result<DeckEvalResult> {
    evaluate_hands(
        request,
        on_progress,
        on_hand_progress,
        true,
        Some(cancel),
        None,
    )
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
        None,
    )
}

pub(crate) fn evaluate_hands(
    request: &DeckEvalRequest,
    on_progress: impl FnMut(EvalProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
    parallel: bool,
    cancel: Option<crate::cancel::CancelFlag>,
    sample_bounds: Option<(u16, u16)>,
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

    let (window_start, window_end) = sample_bounds.unwrap_or((0, request.samples));
    let window_start = window_start.min(request.samples);
    let window_end = window_end.min(request.samples).max(window_start);
    let window_draws: Vec<_> = draws
        .iter()
        .filter(|draw| draw.sample_index >= window_start && draw.sample_index < window_end)
        .collect();

    let mut unique = Vec::new();
    let mut seen = FxHashMap::default();
    for draw in &window_draws {
        let cache_key = (request.sim_type, draw.key);
        if seen.insert(cache_key, draw.sample_index).is_none() {
            unique.push((request.sim_type, draw.key, draw.sample_index));
        }
    }

    let hands_total = request.samples.max(1);
    let window_total = window_end.saturating_sub(window_start).max(1);
    let on_progress = Mutex::new(on_progress);
    let on_hand_progress = Mutex::new(on_hand_progress);
    if report_eval_progress(
        &on_progress,
        EvalProgress {
            sample: window_start,
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
    for draw in &window_draws {
        let cache_key = (request.sim_type, draw.key);
        if cache.contains_key(&cache_key) {
            *remaining_uses.entry(cache_key).or_insert(0) += 1;
        }
    }

    let mut hands = Vec::with_capacity(window_draws.len());
    let mut damages = Vec::with_capacity(window_draws.len());
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
    for draw in &window_draws {
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
            cache.remove(&cache_key).ok_or_else(|| {
                EngineError::invalid("internal: solved draw key missing from cache")
            })?
        } else {
            cache.get(&cache_key).cloned().ok_or_else(|| {
                EngineError::invalid("internal: solved draw key missing from cache")
            })?
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
            sample: window_end,
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
    let timed_out_samples = usize::from(window_total).saturating_sub(sample_count);
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
