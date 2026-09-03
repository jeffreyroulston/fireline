//! Simulation drivers: fire brick, Monte Carlo, oracle, and two-pass modes.

use crate::error::{EngineError, Result};
use crate::{
    cards::{Card, parse_card},
    line_event::EventTape,
    model::{
        DamageDistribution, EffectiveRequest, McRollout, PassResult, SimType, SolveRequest,
        SolveResult, State, TwoPassResult, effective_exhaustive_reservation, effective_glimpse,
        hand_duration, resolve_materials_bitmask, truncate_draw_queue,
    },
    random::{Rng, percentile, shuffle_cards},
};
use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::time::Instant;

use super::memory;
use super::search::Search;

/// Solve an opening hand under the requested simulation mode.
///
/// # Errors
///
/// Returns [`EngineError::InvalidRequest`] when the hand size is out of range,
/// [`EngineError::UnknownCard`] for unrecognized hand entries,
/// [`EngineError::Cancelled`] when a progress callback requests abort, or
/// [`EngineError::HandTimeout`] when a per-hand deadline is exceeded.
pub fn solve(request: &SolveRequest) -> Result<SolveResult> {
    solve_with_progress(request, |_, _| ControlFlow::Continue(()))
}

/// Like [`solve`], but reports Monte Carlo rollout progress as `(done, total)`.
pub fn solve_with_progress(
    request: &SolveRequest,
    on_rollout: impl FnMut(u16, u16) -> ControlFlow<()>,
) -> Result<SolveResult> {
    solve_with_progress_inner(request, on_rollout, true)
}

/// Deck-eval entry: same as [`solve_with_progress`], but drops per-rollout event
/// tapes from the Monte Carlo distribution (headline/P50 tape is kept).
pub(crate) fn solve_for_deck_eval(
    request: &SolveRequest,
    on_rollout: impl FnMut(u16, u16) -> ControlFlow<()>,
) -> Result<SolveResult> {
    solve_with_progress_inner(request, on_rollout, false)
}

fn solve_with_progress_inner(
    request: &SolveRequest,
    on_rollout: impl FnMut(u16, u16) -> ControlFlow<()>,
    retain_rollout_tapes: bool,
) -> Result<SolveResult> {
    if request.hand.len() < 2 || request.hand.len() > 16 {
        return Err(EngineError::invalid("hand must contain 2–16 cards"));
    }
    let hand = request
        .hand
        .iter()
        .map(|card| parse_card(card).ok_or_else(|| EngineError::UnknownCard(card.clone())))
        .collect::<Result<Vec<_>>>()?;
    let max_turns = request
        .max_turns
        .clamp(request.budget.max_turns_min, request.budget.max_turns_max);
    let rollouts = request.rollouts.clamp(1, request.budget.max_solve_rollouts);
    let materials = resolve_materials_bitmask(&request.materials);
    let _deadline_guard =
        hand_duration(request.max_hand_duration_secs).map(crate::deadline::install);
    let glimpse_oracle = effective_glimpse(request.sim_type, false, request.glimpse_enabled);
    let exhaustive_reservation =
        effective_exhaustive_reservation(request.sim_type, request.exhaustive_reservation);
    let max_card_draw = request.max_card_draw;
    let mut result = match request.sim_type {
        SimType::FireBrick => {
            let opening_queue = if request.go_first {
                Vec::new()
            } else {
                truncate_draw_queue(fire_brick_opening_queue(request, &hand), max_card_draw)
            };
            solve_cards_with_queue(
                &hand,
                request.go_first,
                max_turns,
                materials,
                &opening_queue,
            )?
        }
        SimType::MonteCarlo => {
            let remaining = remaining_for_solve(request, &hand)?;
            solve_monte_carlo(
                &hand,
                &remaining,
                request.go_first,
                max_turns,
                MonteCarloConfig {
                    rollouts,
                    seed: request.seed,
                    materials,
                    retain_rollout_tapes,
                    glimpse_enabled: glimpse_oracle,
                    max_card_draw,
                },
                on_rollout,
            )?
        }
        SimType::TwoPass => {
            let (remaining, ordered) = remaining_queue(request, &hand)?;
            solve_two_pass(OracleSolveParams {
                hand: &hand,
                remaining: &remaining,
                go_first: request.go_first,
                max_turns,
                seed: request.seed,
                ordered,
                materials,
                glimpse_enabled: glimpse_oracle,
                exhaustive_reservation,
                max_card_draw,
            })?
        }
        SimType::OracleOnly => {
            let (remaining, ordered) = remaining_queue(request, &hand)?;
            solve_oracle_only(OracleSolveParams {
                hand: &hand,
                remaining: &remaining,
                go_first: request.go_first,
                max_turns,
                seed: request.seed,
                ordered,
                materials,
                glimpse_enabled: glimpse_oracle,
                exhaustive_reservation,
                max_card_draw,
            })?
        }
    };
    result.effective = solve_effective(request, max_turns, rollouts);
    Ok(result)
}

fn solve_effective(request: &SolveRequest, max_turns: u8, rollouts: u16) -> EffectiveRequest {
    EffectiveRequest {
        root_seed: request.seed,
        sim_type: Some(request.sim_type),
        deck: request.deck.clone(),
        go_first: Some(request.go_first),
        max_turns: Some(max_turns),
        rollouts: Some(rollouts),
        budget: request.budget,
        max_threads: request.max_threads,
        glimpse_enabled: request.glimpse_enabled,
        max_hand_duration_secs: request.max_hand_duration_secs,
        max_card_draw: request.max_card_draw,
        exhaustive_reservation: request.exhaustive_reservation,
        ..Default::default()
    }
}

fn hand_solve_effective(
    go_first: bool,
    max_turns: u8,
    sim_type: SimType,
    budget: crate::budget::Budget,
) -> EffectiveRequest {
    EffectiveRequest {
        sim_type: Some(sim_type),
        go_first: Some(go_first),
        max_turns: Some(max_turns),
        budget,
        ..Default::default()
    }
}

/// Fire-brick solve for a concrete opening hand (no request envelope).
///
/// # Errors
///
/// Propagates search failures such as [`EngineError::Cancelled`] from the underlying pass.
pub fn solve_cards(
    hand: &[Card],
    go_first: bool,
    max_turns: u8,
    materials: u16,
) -> Result<SolveResult> {
    solve_cards_with_queue(hand, go_first, max_turns, materials, &[])
}

/// Fire Brick has no attached maindeck by default, so unknown draws stay unplayable
/// Fire Bricks. When a maindeck *is* known (e.g. the hand solver's Decks tab), the one
/// guaranteed "going second" draw uses `queue` to get a real card instead; every draw
/// after that still falls back to Fire Brick once the queue is exhausted.
fn solve_cards_with_queue(
    hand: &[Card],
    go_first: bool,
    max_turns: u8,
    materials: u16,
    queue: &[Card],
) -> Result<SolveResult> {
    let started = Instant::now();
    let (pass, line_stats) = solve_pass(hand, go_first, max_turns, queue, false, false, materials)?;
    Ok(SolveResult {
        sim_type: SimType::FireBrick,
        max_damage: pass.max_damage,
        end_influence: pass.end_influence,
        events: pass.events,
        nodes: pass.nodes,
        memo_entries: pass.memo_entries,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        distribution: None,
        two_pass: None,
        card_stats: summarize_line_stats(hand, &line_stats, materials),
        line_card_stats: line_stats.to_sparse(),
        line_stats,
        brick_line_stats: None,
        effective: hand_solve_effective(
            go_first,
            max_turns,
            SimType::FireBrick,
            crate::budget::Budget::default(),
        ),
    })
}

pub fn solve_pass(
    hand: &[Card],
    go_first: bool,
    max_turns: u8,
    queue: &[Card],
    glimpse_enabled: bool,
    exhaustive_reservation: bool,
    materials: u16,
) -> Result<(PassResult, crate::stats::LineCardStats)> {
    let mut search = Search::new(glimpse_enabled, exhaustive_reservation);
    solve_pass_with(&mut search, hand, go_first, max_turns, queue, materials)
}

fn solve_pass_with(
    search: &mut Search,
    hand: &[Card],
    go_first: bool,
    max_turns: u8,
    queue: &[Card],
    materials: u16,
) -> Result<(PassResult, crate::stats::LineCardStats)> {
    let mut initial = State::with_queue_and_materials(hand, go_first, max_turns, queue, materials);
    let opening_draw = if go_first {
        None
    } else {
        Some(initial.draw_unknown())
    };
    search.reset(search.glimpse_enabled);
    search.set_opening_hand(hand);
    let best = search.visit(initial);
    if search.timed_out {
        search.reset(search.glimpse_enabled);
        return Err(EngineError::HandTimeout);
    }
    if search.aborted {
        search.reset(search.glimpse_enabled);
        return Err(EngineError::Cancelled);
    }
    let mut tape = EventTape::new();
    tape.push_start(initial, opening_draw);
    let mut line_stats = crate::stats::LineCardStats::default();
    if let Some(drawn) = opening_draw {
        line_stats.record_opening_draw(drawn);
    }
    search.reconstruct(initial, best, &mut tape, &mut line_stats);
    if search.timed_out {
        search.reset(search.glimpse_enabled);
        return Err(EngineError::HandTimeout);
    }
    if search.aborted {
        search.reset(search.glimpse_enabled);
        return Err(EngineError::Cancelled);
    }
    let result = (
        PassResult {
            max_damage: best.damage,
            end_influence: best.influence,
            events: tape.events,
            nodes: search.nodes,
            memo_entries: search.memo.len(),
            card_stats: Vec::new(),
        },
        line_stats,
    );
    // Drop the memo before returning so callers that keep the Search shell
    // reuse a clean table; trimming happens once per hand, not per pass.
    search.reset(search.glimpse_enabled);
    Ok(result)
}

fn summarize_line_stats(
    opening: &[Card],
    line: &crate::stats::LineCardStats,
    materials: u16,
) -> Vec<crate::stats::CardStat> {
    let mut acc = crate::stats::DeckStatAccumulator::with_deck_and_materials(opening, materials);
    acc.add_sample(opening, line);
    acc.finish()
}

/// Knobs for a Monte Carlo solve, grouped to keep the signature readable.
#[derive(Clone, Copy)]
struct MonteCarloConfig {
    rollouts: u16,
    seed: u64,
    materials: u16,
    /// When false (deck eval), drop per-rollout event tapes after picking the
    /// headline/P50 line so completed hands do not retain N full tapes in RAM.
    retain_rollout_tapes: bool,
    glimpse_enabled: bool,
    max_card_draw: Option<u16>,
}

fn solve_monte_carlo(
    hand: &[Card],
    remaining: &[Card],
    go_first: bool,
    max_turns: u8,
    config: MonteCarloConfig,
    mut on_rollout: impl FnMut(u16, u16) -> ControlFlow<()>,
) -> Result<SolveResult> {
    let started = Instant::now();
    let rollouts = config.rollouts;
    let materials = config.materials;
    let mut rng = Rng::new(config.seed);
    let mut damages = Vec::with_capacity(rollouts as usize);
    let mut samples = Vec::with_capacity(rollouts as usize);
    let mut sample_influences = Vec::with_capacity(rollouts as usize);
    let mut rollout_stats = Vec::with_capacity(rollouts as usize);
    let mut total_nodes = 0;
    let mut total_memo = 0;
    let mut stats_acc = crate::stats::DeckStatAccumulator::with_deck_and_materials(hand, materials);
    // Reuse one Search shell; reset() drops the memo table each rollout.
    let mut search = Search::new(config.glimpse_enabled, false);

    if on_rollout(0, rollouts).is_break() {
        return Err(EngineError::Cancelled);
    }

    for done in 1..=rollouts {
        let mut queue = remaining.to_vec();
        shuffle_cards(&mut queue, &mut rng);
        let queue = truncate_draw_queue(queue, config.max_card_draw);
        let (pass, line_stats) =
            solve_pass_with(&mut search, hand, go_first, max_turns, &queue, materials)?;
        total_nodes += pass.nodes;
        total_memo += pass.memo_entries;
        damages.push(pass.max_damage);
        sample_influences.push(pass.end_influence);
        samples.push(McRollout {
            damage: pass.max_damage,
            events: pass.events,
            nodes: pass.nodes,
        });
        stats_acc.add_sample(hand, &line_stats);
        rollout_stats.push(line_stats);
        if on_rollout(done, rollouts).is_break() {
            return Err(EngineError::Cancelled);
        }
    }
    // The memo was reset after every rollout; return the freed pages once per
    // hand so parallel deck eval does not stack arenas across hands.
    memory::release_process_memory();

    let mut sorted = damages.clone();
    sorted.sort_unstable();
    let mean =
        damages.iter().map(|&value| f64::from(value)).sum::<f64>() / damages.len().max(1) as f64;
    let p50 = percentile(&sorted, 50);
    let median_index = samples
        .iter()
        .position(|sample| sample.damage == p50)
        .unwrap_or(0);
    // Headline line: keep the P50 tape on SolveResult.events. Deck eval drops
    // per-rollout tapes from the distribution to bound RAM across many hands.
    let headline_influence = sample_influences.get(median_index).copied().unwrap_or(0);
    let headline_damage = samples[median_index].damage;
    let headline_events = if config.retain_rollout_tapes {
        samples[median_index].events.clone()
    } else {
        std::mem::take(&mut samples[median_index].events)
    };
    if !config.retain_rollout_tapes {
        for sample in &mut samples {
            sample.events.clear();
        }
    }
    let headline_stats = rollout_stats
        .into_iter()
        .nth(median_index)
        .unwrap_or_default();

    Ok(SolveResult {
        sim_type: SimType::MonteCarlo,
        max_damage: headline_damage,
        end_influence: headline_influence,
        events: headline_events,
        nodes: total_nodes,
        memo_entries: total_memo,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        distribution: Some(DamageDistribution {
            damages,
            mean,
            p10: percentile(&sorted, 10),
            p50,
            p90: percentile(&sorted, 90),
            min: sorted.first().copied().unwrap_or(0),
            max: sorted.last().copied().unwrap_or(0),
            rollouts: samples,
        }),
        two_pass: None,
        card_stats: stats_acc.finish(),
        line_card_stats: headline_stats.to_sparse(),
        line_stats: headline_stats,
        brick_line_stats: None,
        effective: hand_solve_effective(
            go_first,
            max_turns,
            SimType::MonteCarlo,
            crate::budget::Budget::default(),
        ),
    })
}

fn oracle_queue(remaining: &[Card], seed: u64, ordered: bool) -> Vec<Card> {
    if ordered {
        return remaining.to_vec();
    }
    let mut queue = remaining.to_vec();
    let mut rng = Rng::new(seed);
    shuffle_cards(&mut queue, &mut rng);
    queue
}

fn remaining_for_solve(request: &SolveRequest, hand: &[Card]) -> Result<Vec<Card>> {
    Ok(remaining_queue(request, hand)?.0)
}

fn remaining_queue(request: &SolveRequest, hand: &[Card]) -> Result<(Vec<Card>, bool)> {
    if let Some(ids) = &request.queue {
        let cards = ids
            .iter()
            .map(|id| parse_card(id).ok_or_else(|| EngineError::UnknownQueueCard(id.clone())))
            .collect::<Result<Vec<_>>>()?;
        return Ok((cards, true));
    }
    Ok((remaining_deck(&request.deck, hand)?, false))
}

struct OracleSolveParams<'a> {
    hand: &'a [Card],
    remaining: &'a [Card],
    go_first: bool,
    max_turns: u8,
    seed: u64,
    ordered: bool,
    materials: u16,
    glimpse_enabled: bool,
    exhaustive_reservation: bool,
    max_card_draw: Option<u16>,
}

fn solve_two_pass(params: OracleSolveParams<'_>) -> Result<SolveResult> {
    let OracleSolveParams {
        hand,
        remaining,
        go_first,
        max_turns,
        seed,
        ordered,
        materials,
        glimpse_enabled: glimpse_oracle,
        exhaustive_reservation,
        max_card_draw,
    } = params;
    let started = Instant::now();
    let (mut brick, brick_stats) =
        solve_pass(hand, go_first, max_turns, &[], false, false, materials)?;
    let queue = truncate_draw_queue(oracle_queue(remaining, seed, ordered), max_card_draw);
    let (mut oracle, oracle_stats) = solve_pass(
        hand,
        go_first,
        max_turns,
        &queue,
        glimpse_oracle,
        exhaustive_reservation,
        materials,
    )?;
    memory::release_process_memory();
    brick.card_stats = summarize_line_stats(hand, &brick_stats, materials);
    oracle.card_stats = summarize_line_stats(hand, &oracle_stats, materials);
    let mut combined = crate::stats::DeckStatAccumulator::with_deck_and_materials(hand, materials);
    combined.add_sample(hand, &brick_stats);
    combined.add_sample(hand, &oracle_stats);

    Ok(SolveResult {
        sim_type: SimType::TwoPass,
        max_damage: brick.max_damage,
        end_influence: brick.end_influence,
        events: brick.events.clone(),
        nodes: brick.nodes + oracle.nodes,
        memo_entries: brick.memo_entries + oracle.memo_entries,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        distribution: None,
        two_pass: Some(TwoPassResult { brick, oracle }),
        card_stats: combined.finish(),
        line_card_stats: oracle_stats.to_sparse(),
        line_stats: oracle_stats,
        brick_line_stats: Some(brick_stats),
        effective: hand_solve_effective(
            go_first,
            max_turns,
            SimType::TwoPass,
            crate::budget::Budget::default(),
        ),
    })
}

fn solve_oracle_only(params: OracleSolveParams<'_>) -> Result<SolveResult> {
    let OracleSolveParams {
        hand,
        remaining,
        go_first,
        max_turns,
        seed,
        ordered,
        materials,
        glimpse_enabled,
        exhaustive_reservation,
        max_card_draw,
    } = params;
    let started = Instant::now();
    let queue = truncate_draw_queue(oracle_queue(remaining, seed, ordered), max_card_draw);
    let (pass, line_stats) = solve_pass(
        hand,
        go_first,
        max_turns,
        &queue,
        glimpse_enabled,
        exhaustive_reservation,
        materials,
    )?;
    memory::release_process_memory();
    Ok(SolveResult {
        sim_type: SimType::OracleOnly,
        max_damage: pass.max_damage,
        end_influence: pass.end_influence,
        events: pass.events,
        nodes: pass.nodes,
        memo_entries: pass.memo_entries,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        distribution: None,
        two_pass: None,
        card_stats: summarize_line_stats(hand, &line_stats, materials),
        line_card_stats: line_stats.to_sparse(),
        line_stats,
        brick_line_stats: None,
        effective: hand_solve_effective(
            go_first,
            max_turns,
            SimType::OracleOnly,
            crate::budget::Budget::default(),
        ),
    })
}

/// Picks the real card for Fire Brick's guaranteed "going second" draw when the request
/// has an explicit remaining-deck order or an attached maindeck and seed. Returns an
/// empty queue (falling back to the usual Fire Brick placeholder) when neither is
/// available, since Fire Brick doesn't require a deck.
fn fire_brick_opening_queue(request: &SolveRequest, hand: &[Card]) -> Vec<Card> {
    if let Some(ids) = &request.queue {
        return ids
            .first()
            .and_then(|id| parse_card(id))
            .into_iter()
            .collect();
    }
    let Ok(mut remaining) = remaining_deck(&request.deck, hand) else {
        return Vec::new();
    };
    let mut rng = Rng::new(request.seed);
    shuffle_cards(&mut remaining, &mut rng);
    remaining.truncate(1);
    remaining
}

fn remaining_deck(deck: &BTreeMap<String, u8>, hand: &[Card]) -> Result<Vec<Card>> {
    if deck.is_empty() {
        return Err(EngineError::invalid(
            "Monte Carlo, Two-pass, and Oracle need a maindeck so unknown draws can be sampled",
        ));
    }
    let mut counts = BTreeMap::new();
    for (id, &count) in deck {
        let card = parse_card(id).ok_or_else(|| EngineError::UnknownDeckCard(id.clone()))?;
        *counts.entry(card).or_insert(0_u8) += count;
    }

    // Prefer treating `deck` as a full maindeck and removing the opening hand.
    // If the hand is not a subset (common in the hand solver when improvising),
    // treat the provided counts as the remaining library as-is.
    let mut after_hand = counts.clone();
    let mut hand_fits = true;
    for &card in hand {
        match after_hand.get_mut(&card) {
            Some(entry) if *entry > 0 => *entry -= 1,
            _ => {
                hand_fits = false;
                break;
            }
        }
    }
    let final_counts = if hand_fits { after_hand } else { counts };

    let mut remaining = Vec::new();
    for (card, count) in final_counts {
        remaining.extend(std::iter::repeat_n(card, count as usize));
    }
    if remaining.is_empty() {
        return Err(EngineError::invalid(
            "no cards remain in the deck after removing the opening hand",
        ));
    }
    Ok(remaining)
}
