use crate::error::{EngineError, Result};
use crate::{
    cards::{ALL_CARDS, Card, parse_card},
    line_event::{
        ActionOp, AttackBonuses, EventFields, EventKind, EventTape, LineEvent, TapePhase,
        push_ally_gy_death,
    },
    model::{
        Action, DamageDistribution, EffectiveRequest, MAT_BLADE, MAT_DAGGER, MAT_HAMMER, MAT_RING,
        MAT_RIPPER, MAT_SOULKNIFE, MAT_TRISTAN, MAT_ZANDER, MAT_ZANDER_2, McRollout, PassResult,
        Phase, SimType, SolveRequest, SolveResult, State, TwoPassResult, Weapon,
        effective_glimpse, hand_duration, resolve_materials_bitmask, truncate_draw_queue,
    },
    random::{Rng, percentile, shuffle_cards},
};
use rustc_hash::FxHashMap;
use sha2::{Digest, Sha256};
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::time::Instant;

/// Best line score: maximize damage, then final hand+memory (influence).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Outcome {
    damage: u8,
    influence: u8,
}

impl Outcome {
    #[inline]
    fn better(self, other: Self) -> bool {
        self.damage > other.damage
            || (self.damage == other.damage && self.influence > other.influence)
    }
}

/// Memoized gain from a board (damage zeroed) plus terminal influence of the best line.
#[derive(Clone, Copy)]
struct MemoValue {
    damage_gain: u8,
    end_influence: u8,
}

/// Park / generational-reset checkpoint cadence (~262k nodes).
const PARK_CHECK_MASK: u64 = 0x3_FFFF;

/// Optimistic damage per influence-reservation (2.5), as rational 5/2.
const OPT_DMG_PER_RESERVE_NUM: u16 = 5;
const OPT_DMG_PER_RESERVE_DEN: u16 = 2;
/// Below this reservation budget, skip bound pruning and finish the line.
const FINISH_RESERVE_THRESHOLD: u8 = 5;

struct Search {
    memo: FxHashMap<State, MemoValue>,
    nodes: u64,
    glimpse_enabled: bool,
    /// Base entry cap; live limit is scaled by pressure squeeze.
    memo_cap: usize,
    memo_generations: u32,
    /// Set when cooperative cancel fires mid-search; visit returns early.
    aborted: bool,
    /// Set when the per-hand wall-clock deadline fires mid-search.
    timed_out: bool,
    /// Best damage found so far in this search (branch-and-bound incumbent).
    incumbent_damage: u8,
    /// When false (reconstruct), skip bound pruning so memo/target matching stays exact.
    bound_prune: bool,
    /// SHA-256 hex of sorted opening card ids (matches API `handHash`).
    hand_hash: String,
    /// Sorted opening card ids for log readability.
    hand_label: String,
}

impl Search {
    fn new(glimpse_enabled: bool) -> Self {
        Self::with_memo_cap(glimpse_enabled, crate::pressure::memo_cap_entries())
    }

    fn with_memo_cap(glimpse_enabled: bool, memo_cap: usize) -> Self {
        Self {
            memo: FxHashMap::with_capacity_and_hasher(16_384, Default::default()),
            nodes: 0,
            glimpse_enabled,
            memo_cap: memo_cap.max(1),
            memo_generations: 0,
            aborted: false,
            timed_out: false,
            incumbent_damage: 0,
            bound_prune: true,
            hand_hash: String::new(),
            hand_label: String::new(),
        }
    }

    /// Drop memo entries. Replacing the table avoids hashbrown retaining a
    /// high-water allocation that the system allocator will not return to the OS.
    fn reset(&mut self, glimpse_enabled: bool) {
        self.memo = FxHashMap::with_capacity_and_hasher(16_384, Default::default());
        self.nodes = 0;
        self.glimpse_enabled = glimpse_enabled;
        self.memo_generations = 0;
        self.aborted = false;
        self.timed_out = false;
        self.incumbent_damage = 0;
        self.bound_prune = true;
        // Keep hand_hash / hand_label across resets within the same opening hand.
    }

    fn set_opening_hand(&mut self, hand: &[Card]) {
        self.hand_hash = opening_hand_hash(hand);
        self.hand_label = opening_hand_label(hand);
    }

    fn drop_memo_generation(&mut self) {
        self.memo_generations = self.memo_generations.saturating_add(1);
        // Hard hands reset thousands of times; log the first and then powers
        // of two so WORKER_LOG_RUNS stays useful without flooding the console.
        let n = self.memo_generations;
        if n == 1 || n.is_power_of_two() {
            tracing::info!(
                generations = n,
                nodes = self.nodes,
                cap = self.memo_cap,
                hand_hash = self.hand_hash.as_str(),
                hand = self.hand_label.as_str(),
                "search memo generational reset"
            );
        }
        self.memo = FxHashMap::with_capacity_and_hasher(16_384, Default::default());
    }

    fn checkpoint(&mut self) {
        if self.nodes & PARK_CHECK_MASK != 0 {
            return;
        }
        if crate::cancel::is_cancel_requested() {
            self.aborted = true;
            return;
        }
        if crate::deadline::is_expired() {
            self.timed_out = true;
            self.aborted = true;
            return;
        }
        if !crate::pressure::is_parked() {
            return;
        }
        // Release memo pages so the machine can reclaim them, then wait.
        self.drop_memo_generation();
        release_process_memory();
        crate::pressure::wait_while_parked();
        // Re-check after park: disconnect may have happened while we slept.
        if crate::cancel::is_cancel_requested() {
            self.aborted = true;
        } else if crate::deadline::is_expired() {
            self.timed_out = true;
            self.aborted = true;
        }
    }

    fn visit(&mut self, state: State) -> Outcome {
        self.nodes += 1;
        self.checkpoint();
        if self.aborted {
            return Outcome {
                damage: state.damage,
                influence: 0,
            };
        }
        if state.is_terminal() {
            let outcome = Outcome {
                damage: state.damage,
                influence: state.influence(),
            };
            if outcome.damage > self.incumbent_damage {
                self.incumbent_damage = outcome.damage;
            }
            return outcome;
        }
        let mut board = state;
        board.damage = 0;
        if let Some(&memo) = self.memo.get(&board) {
            let outcome = Outcome {
                damage: state.damage.saturating_add(memo.damage_gain),
                influence: memo.end_influence,
            };
            if outcome.damage > self.incumbent_damage {
                self.incumbent_damage = outcome.damage;
            }
            return outcome;
        }

        // Branch-and-bound: skip subtrees that cannot beat the incumbent.
        // Do not memoize pruned nodes (incomplete expansion).
        if self.bound_prune && std::env::var_os("GA_FIRE_NO_BNB").is_none() {
            let reserve = reservation_budget(state);
            if reserve > FINISH_RESERVE_THRESHOLD {
                let upper = state
                    .damage
                    .saturating_add(optimistic_remaining_damage(state));
                if upper < self.incumbent_damage {
                    return Outcome {
                        damage: state.damage,
                        influence: 0,
                    };
                }
            }
        }

        let mut best = Outcome {
            damage: state.damage,
            influence: 0,
        };
        let mut acts = solver_actions(state, self.glimpse_enabled);
        order_actions_damage_first(&state, &mut acts);
        for action in acts {
            let next = apply_silent(state, action);
            let outcome = self.visit(next);
            if self.aborted {
                return outcome;
            }
            if outcome.better(best) {
                best = outcome;
            }
            if best.damage > self.incumbent_damage {
                self.incumbent_damage = best.damage;
            }
        }
        debug_assert!(best.damage >= state.damage);
        debug_assert!(best.damage < u8::MAX);
        let cap = crate::pressure::effective_memo_cap(self.memo_cap);
        if self.memo.len() >= cap {
            self.drop_memo_generation();
        }
        self.memo.insert(
            board,
            MemoValue {
                damage_gain: best.damage - state.damage,
                end_influence: best.influence,
            },
        );
        best
    }

    fn reconstruct(
        &mut self,
        state: State,
        target: Outcome,
        tape: &mut EventTape,
        stats: &mut crate::stats::LineCardStats,
    ) {
        if state.is_terminal() {
            return;
        }
        let prune = self.bound_prune;
        self.bound_prune = false;
        let mut acts = solver_actions(state, self.glimpse_enabled);
        order_actions_damage_first(&state, &mut acts);
        for action in acts {
            let saved = tape.checkpoint();
            let next = apply_into(state, action, tape, None);
            if self.visit(next) == target {
                let burst = &tape.events[saved.events_len..];
                stats.record_action(action, state, next, burst);
                self.bound_prune = prune;
                self.reconstruct(next, target, tape, stats);
                return;
            }
            tape.restore(saved);
        }
        self.bound_prune = prune;
    }
}

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
    let _deadline_guard = hand_duration(request.max_hand_duration_secs).map(crate::deadline::install);
    let glimpse_oracle = effective_glimpse(request.sim_type, false, request.glimpse_enabled);
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
            solve_two_pass(
                &hand,
                &remaining,
                request.go_first,
                max_turns,
                request.seed,
                ordered,
                materials,
                glimpse_oracle,
                max_card_draw,
            )?
        }
        SimType::OracleOnly => {
            let (remaining, ordered) = remaining_queue(request, &hand)?;
            solve_oracle_only(
                &hand,
                &remaining,
                request.go_first,
                max_turns,
                request.seed,
                ordered,
                materials,
                glimpse_oracle,
                max_card_draw,
            )?
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

pub fn solve_cards(hand: &[Card], go_first: bool, max_turns: u8, materials: u16) -> SolveResult {
    solve_cards_with_queue(hand, go_first, max_turns, materials, &[])
        .expect("fire brick solve should not cancel without a cancel flag")
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
    let (pass, line_stats) = solve_pass(hand, go_first, max_turns, queue, false, materials)?;
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
    materials: u16,
) -> Result<(PassResult, crate::stats::LineCardStats)> {
    let mut search = Search::new(glimpse_enabled);
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
    let mut search = Search::new(config.glimpse_enabled);

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
    release_process_memory();

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

fn solve_two_pass(
    hand: &[Card],
    remaining: &[Card],
    go_first: bool,
    max_turns: u8,
    seed: u64,
    ordered: bool,
    materials: u16,
    glimpse_oracle: bool,
    max_card_draw: Option<u16>,
) -> Result<SolveResult> {
    let started = Instant::now();
    let (mut brick, brick_stats) = solve_pass(hand, go_first, max_turns, &[], false, materials)?;
    let queue = truncate_draw_queue(oracle_queue(remaining, seed, ordered), max_card_draw);
    let (mut oracle, oracle_stats) =
        solve_pass(hand, go_first, max_turns, &queue, glimpse_oracle, materials)?;
    release_process_memory();
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

fn solve_oracle_only(
    hand: &[Card],
    remaining: &[Card],
    go_first: bool,
    max_turns: u8,
    seed: u64,
    ordered: bool,
    materials: u16,
    glimpse_enabled: bool,
    max_card_draw: Option<u16>,
) -> Result<SolveResult> {
    let started = Instant::now();
    let queue = truncate_draw_queue(oracle_queue(remaining, seed, ordered), max_card_draw);
    let (pass, line_stats) =
        solve_pass(hand, go_first, max_turns, &queue, glimpse_enabled, materials)?;
    release_process_memory();
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

fn is_fast_phase(phase: Phase) -> bool {
    matches!(phase, Phase::Materialize | Phase::Agility)
}

const ACTION_CARDS: [Card; 15] = [
    Card::FieryInterference,
    Card::IntensifiedPyre,
    Card::MarkTheTarget,
    Card::PlantedExplosive,
    Card::VermilionDecree,
    Card::Demolition,
    Card::SurgingBolt,
    Card::Incapacitate,
    Card::UndeniableTruth,
    Card::IgniteFate,
    Card::IncreasingDanger,
    Card::ReduceToAsh,
    Card::SmokeOut,
    Card::SparkAlight,
    Card::FlurryOfFire,
];

/// Action cards that deal modeled positive damage (excludes pure-draw / no-effect actions).
const DAMAGE_ACTION_CARDS: [Card; 11] = [
    Card::FieryInterference,
    Card::IntensifiedPyre,
    Card::MarkTheTarget,
    Card::PlantedExplosive,
    Card::VermilionDecree,
    Card::Demolition,
    Card::SurgingBolt,
    Card::IgniteFate,
    Card::SmokeOut,
    Card::SparkAlight,
    Card::FlurryOfFire,
];

fn is_pure_draw_card(card: Card) -> bool {
    matches!(card, Card::IncreasingDanger | Card::UndeniableTruth)
}

/// Mate recollects memory before Main; ignore the Mate draw (unknown / not yet taken).
fn board_for_damage_threat_check(mut state: State) -> State {
    if state.phase == Phase::Materialize && state.memory_len > 0 {
        for card in ALL_CARDS {
            let count = state.memory[card.index()];
            if count == 0 {
                continue;
            }
            state.hand[card.index()] = state.hand[card.index()].saturating_add(count);
            state.memory[card.index()] = 0;
        }
        state.hand_len = state.hand_len.saturating_add(state.memory_len);
        state.memory_len = 0;
    }
    state
}

fn can_afford_action(state: &State, card: Card) -> bool {
    if !state.has(card) {
        return false;
    }
    let cost = action_cost(state, card);
    let max_kindle = card.kindle().min(state.fire_gy).min(cost);
    for kindle in 0..=max_kindle {
        let reserve = cost.saturating_sub(kindle);
        if state.hand_len.saturating_sub(1) >= reserve {
            return true;
        }
    }
    false
}

/// Approximate: board still has a legal positive-damage Main path (no recursive `actions()`).
fn has_positive_damage_main_play(state: State) -> bool {
    let state = board_for_damage_threat_check(state);
    let turn0_first = state.go_first && state.turn == 0;

    if state.dagger && state.dagger_ready {
        return true;
    }

    if !turn0_first {
        for index in 0..state.ally_len as usize {
            if state.can_ally_attack(index) {
                return true;
            }
        }

        if state.champion_awake {
            for card in [
                Card::IgnitedStab,
                Card::RendingFlames,
                Card::HeatedVengeance,
                Card::ViciousSlice,
            ] {
                if state.has(card) && state.hand_len.saturating_sub(1) >= card.cost() {
                    return true;
                }
            }
            for weapon in Weapon::EQUIPPABLE {
                if state.has_weapon(weapon) {
                    return true;
                }
            }
        }

        if state.has(Card::UncannyRealization)
            && state.hand_len.saturating_sub(1) >= Card::UncannyRealization.cost()
        {
            for index in 0..state.ally_len as usize {
                let ally = state.allies[index];
                if ally.card().is_automaton() && ally.awake() {
                    return true;
                }
            }
        }

        if state.has(Card::BlazingThrow) && state.any_weapon() && state.hand_len >= 2 {
            return true;
        }
    }

    for card in DAMAGE_ACTION_CARDS {
        if can_afford_action(&state, card) {
            return true;
        }
    }

    // Soft: Truth/prep → Blade → swing counts as a remaining damage path.
    if !turn0_first && state.champion_awake && state.prep > 0 && state.has_material(MAT_BLADE) {
        return true;
    }

    false
}

/// Pay for a pure-draw action without resolving its draws (threat check only).
fn simulate_pure_draw_payment(
    mut state: State,
    card: Card,
    kindle: u8,
    sacrifice_ally: Option<u8>,
) -> Option<State> {
    if let Some(index) = sacrifice_ally
        && index as usize >= state.ally_len as usize
    {
        return None;
    }
    if !state.remove_hand(card) {
        return None;
    }
    if let Some(index) = sacrifice_ally {
        state.remove_ally(index as usize, true)?;
    }
    let cost = action_cost(&state, card);
    if !state.pay_with_kindle(cost, kindle) {
        return None;
    }
    if card == Card::UndeniableTruth {
        state.prep = state.prep.saturating_add(1);
    }
    Some(state)
}

/// Never spend the last playable hand on pure draw on the **final** turn when
/// damage is still legal.
fn refuse_last_hand_pure_draw(before: State, after: State) -> bool {
    // Earlier turns: digging can set up later Mains — do not gate.
    if before.turn.saturating_add(1) < before.max_turns {
        return false;
    }
    // On Death from a Truth sacrifice is damage from the play itself — keep it.
    if after.damage > before.damage {
        return false;
    }
    has_positive_damage_main_play(before) && !has_positive_damage_main_play(after)
}

/// Reserve cost after Class Bonus reductions (Incapacitate costs 2 less while Assassin).
fn action_cost(state: &State, card: Card) -> u8 {
    let cost = card.cost();
    if card == Card::Incapacitate && state.is_assassin() {
        cost.saturating_sub(2)
    } else {
        cost
    }
}

/// Undeniable Truth: additional cost sacrifices an ally, so offer one play per ally.
fn push_undeniable_truth_plays(state: State, result: &mut Vec<Action>) {
    if !state.has(Card::UndeniableTruth) || state.hand_len < 2 {
        return;
    }
    for index in 0..state.ally_len as usize {
        let Some(after) =
            simulate_pure_draw_payment(state, Card::UndeniableTruth, 0, Some(index as u8))
        else {
            continue;
        };
        if refuse_last_hand_pure_draw(state, after) {
            continue;
        }
        result.push(Action::PlayAction {
            card: Card::UndeniableTruth,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: Some(index as u8),
        });
    }
}

fn push_action_plays(state: State, result: &mut Vec<Action>) {
    for card in ACTION_CARDS {
        if !state.has(card) {
            continue;
        }
        if card == Card::UndeniableTruth {
            push_undeniable_truth_plays(state, result);
            continue;
        }
        let cost = action_cost(&state, card);
        let max_kindle = card.kindle().min(state.fire_gy).min(cost);
        for kindle in 0..=max_kindle {
            let reserve = cost.saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            if is_pure_draw_card(card) {
                let Some(after) = simulate_pure_draw_payment(state, card, kindle, None) else {
                    continue;
                };
                if refuse_last_hand_pure_draw(state, after) {
                    continue;
                }
            }
            let can_prepare =
                card.prepare() > 0 && state.prep >= card.prepare() && state.is_assassin();
            let fire_after = if card.is_fire() {
                state.fire_hand_count().saturating_sub(1)
            } else {
                state.fire_hand_count()
            };
            let can_fire_imbue =
                card.imbue() > 0 && reserve >= card.imbue() && fire_after >= reserve;
            let offer_fire_only = can_fire_imbue && state.non_fire_hand_count() > 0;

            let mut push_action = |prepared: bool, imbue: bool| {
                result.push(Action::PlayAction {
                    card,
                    kindle,
                    prepared,
                    imbue,
                    sacrifice_ally: None,
                });
            };

            if can_prepare {
                if offer_fire_only {
                    push_action(true, true);
                }
                push_action(true, false);
            }
            if offer_fire_only {
                push_action(false, true);
            }
            push_action(false, false);
        }
    }
}

fn push_fast_ally_plays(state: State, result: &mut Vec<Action>) {
    for card in ALL_CARDS {
        if !card.is_ally() || !card.is_fast() || !state.has(card) {
            continue;
        }
        let max_kindle = card.kindle().min(state.fire_gy).min(card.cost());
        for kindle in 0..=max_kindle {
            let reserve = card.cost().saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally: None,
                hot_cake_sacrifice: false,
                flagrant_level: None,
                flagrant_gy_return: None,
            });
        }
    }
}

fn zander_gy_return_options(state: State) -> Vec<Card> {
    if !state.is_assassin() {
        return Vec::new();
    }
    ALL_CARDS
        .iter()
        .copied()
        .filter(|&card| card.zander_gy_returnable() && state.gy_count(card) > 0)
        .collect()
}

fn flagrant_level_targets(state: State) -> [Option<u16>; 2] {
    let mut targets = [None; 2];
    let mut count = 0;
    if state.champion_level == 0 {
        if state.has_material(MAT_ZANDER) {
            targets[count] = Some(MAT_ZANDER);
            count += 1;
        }
        if !state.tristan_leveled && state.has_material(MAT_TRISTAN) {
            targets[count] = Some(MAT_TRISTAN);
        }
    } else if state.champion_level == 1 && state.has_material(MAT_ZANDER_2) {
        targets[0] = Some(MAT_ZANDER_2);
    }
    targets
}

fn peppered_chef_sacrifice_targets(state: &State) -> impl Iterator<Item = u8> + '_ {
    (0..state.ally_len).filter_map(|index| {
        let index = index as usize;
        if state.allies[index].card() != Card::Arthur {
            Some(index as u8)
        } else {
            None
        }
    })
}

fn push_peppered_chef_plays(
    state: State,
    card: Card,
    kindle: u8,
    result: &mut Vec<Action>,
) {
    for index in peppered_chef_sacrifice_targets(&state) {
        let mut hot_cake_options = vec![false];
        if state.hot_cake > 0 {
            hot_cake_options.insert(0, true);
        }
        for hot_cake_sacrifice in hot_cake_options {
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally: Some(index),
                hot_cake_sacrifice,
                flagrant_level: None,
                flagrant_gy_return: None,
            });
        }
    }
}

fn flagrant_guide_actions(
    state: State,
    card: Card,
    kindle: u8,
    sacrifice_ally: Option<u8>,
    hot_cake_sacrifice: bool,
) -> Vec<Action> {
    let mut result = Vec::new();
    for mat in flagrant_level_targets(state) {
        let Some(mat) = mat else {
            continue;
        };
        if mat == MAT_ZANDER_2 {
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally,
                hot_cake_sacrifice,
                flagrant_level: Some(mat),
                flagrant_gy_return: None,
            });
            for gy_card in zander_gy_return_options(state) {
                result.push(Action::PlayAlly {
                    card,
                    kindle,
                    sacrifice_ally,
                    hot_cake_sacrifice,
                    flagrant_level: Some(mat),
                    flagrant_gy_return: Some(gy_card),
                });
            }
        } else {
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally,
                hot_cake_sacrifice,
                flagrant_level: Some(mat),
                flagrant_gy_return: None,
            });
        }
    }
    result
}

fn push_fast_action_plays(state: State, result: &mut Vec<Action>) {
    for card in ACTION_CARDS {
        if !card.is_fast() || !state.has(card) {
            continue;
        }
        if card == Card::UndeniableTruth {
            push_undeniable_truth_plays(state, result);
            continue;
        }
        let cost = action_cost(&state, card);
        let max_kindle = card.kindle().min(state.fire_gy).min(cost);
        for kindle in 0..=max_kindle {
            let reserve = cost.saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            let can_prepare =
                card.prepare() > 0 && state.prep >= card.prepare() && state.is_assassin();
            let fire_after = if card.is_fire() {
                state.fire_hand_count().saturating_sub(1)
            } else {
                state.fire_hand_count()
            };
            let can_fire_imbue =
                card.imbue() > 0 && reserve >= card.imbue() && fire_after >= reserve;
            let offer_fire_only = can_fire_imbue && state.non_fire_hand_count() > 0;

            let mut push_action = |prepared: bool, imbue: bool| {
                result.push(Action::PlayAction {
                    card,
                    kindle,
                    prepared,
                    imbue,
                    sacrifice_ally: None,
                });
            };

            if can_prepare {
                if offer_fire_only {
                    push_action(true, true);
                }
                push_action(true, false);
            }
            if offer_fire_only {
                push_action(false, true);
            }
            push_action(false, false);
        }
    }
}

fn push_fast_plays(state: State, result: &mut Vec<Action>) {
    push_fast_ally_plays(state, result);
    push_fast_action_plays(state, result);
}

/// Influence-reservation budget: current influence × Mains left (including now).
fn reservation_budget(state: State) -> u8 {
    let mains = state.max_turns.saturating_sub(state.turn).max(1);
    state.influence().saturating_mul(mains)
}

/// Optimistic remaining damage from a reservation budget at 2.5 dmg / influence.
fn optimistic_remaining_from_reserve(reserve: u8) -> u8 {
    let scaled = u16::from(reserve) * OPT_DMG_PER_RESERVE_NUM / OPT_DMG_PER_RESERVE_DEN;
    scaled.min(u16::from(u8::MAX)) as u8
}

/// Zero-reserve damage still on the board / sideboard (allies, weapons, dagger).
/// Required so `2.5 × reservation` stays admissible — board swings are not paid from I.
fn optimistic_free_board_damage(state: State) -> u8 {
    let mains = u16::from(state.max_turns.saturating_sub(state.turn).max(1));
    let mut total = 0_u16;
    for index in 0..state.ally_len as usize {
        let power = u16::from(state.ally_power(state.allies[index]));
        total = total.saturating_add(power.saturating_mul(mains));
    }
    for weapon in Weapon::EQUIPPABLE {
        let dur = u16::from(state.weapon_durability(weapon));
        if dur == 0 {
            continue;
        }
        total = total.saturating_add(dur.saturating_mul(u16::from(state.weapon_power(weapon))));
    }
    if state.dagger {
        // Ready on each wake; 1 damage per remaining Main.
        total = total.saturating_add(mains);
    }
    let sideboard = |weapon: Weapon, mat: u16| {
        if state.has_material(mat) {
            u16::from(weapon.power().saturating_mul(weapon.durability()))
        } else {
            0
        }
    };
    total = total.saturating_add(sideboard(Weapon::ImpactHammer, MAT_HAMMER));
    total = total.saturating_add(sideboard(Weapon::MercenaryBlade, MAT_BLADE));
    total = total.saturating_add(sideboard(Weapon::VaruckanSoulknife, MAT_SOULKNIFE));
    total = total.saturating_add(sideboard(Weapon::AssassinsRipper, MAT_RIPPER));
    // Ripper activate can add +2 power for a swing — pad when Ripper is available.
    if state.has_material(MAT_RIPPER) || state.has_weapon(Weapon::AssassinsRipper) {
        total = total.saturating_add(2);
    }
    total.min(u16::from(u8::MAX)) as u8
}

fn optimistic_remaining_damage(state: State) -> u8 {
    optimistic_remaining_from_reserve(reservation_budget(state))
        .saturating_add(optimistic_free_board_damage(state))
}

/// SHA-256 hex of sorted card ids — same payload as the API `handHash` helper.
pub fn opening_hand_hash(hand: &[Card]) -> String {
    let mut ids: Vec<&str> = hand.iter().map(|card| card.id()).collect();
    ids.sort_unstable();
    let digest = Sha256::digest(ids.join(",").as_bytes());
    hex_lower(&digest)
}

fn opening_hand_label(hand: &[Card]) -> String {
    let mut ids: Vec<&str> = hand.iter().map(|card| card.id()).collect();
    ids.sort_unstable();
    ids.join(",")
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

/// Memo board key: same contract as `Search::visit` (damage excluded from the key).
fn memo_board_key(mut state: State) -> State {
    state.damage = 0;
    state
}

/// Stable reorder: actions that deal damage this step before dig / setup / pass.
/// Exact search — only changes expansion order (earlier incumbent for future BnB).
fn order_actions_damage_first(state: &State, actions: &mut [Action]) {
    actions.sort_by_key(|action| !action_deals_immediate_damage(state, *action));
}

fn action_deals_immediate_damage(state: &State, action: Action) -> bool {
    match action {
        Action::AttackArthur(_)
        | Action::AttackOthers
        | Action::PlayAttack { .. }
        | Action::AttackWithWeapon(_)
        | Action::BlazingThrow(_)
        | Action::ActivateDagger => true,
        Action::PlayAction {
            card,
            sacrifice_ally,
            ..
        } => {
            if matches!(
                card,
                Card::FieryInterference
                    | Card::IntensifiedPyre
                    | Card::MarkTheTarget
                    | Card::PlantedExplosive
                    | Card::VermilionDecree
                    | Card::Demolition
                    | Card::SurgingBolt
                    | Card::IgniteFate
                    | Card::SmokeOut
                    | Card::SparkAlight
                    | Card::FlurryOfFire
            ) {
                return true;
            }
            if card == Card::UndeniableTruth
                && let Some(index) = sacrifice_ally
                && (index as usize) < state.ally_len as usize
            {
                return state.allies[index as usize].card().on_death_damage() > 0;
            }
            false
        }
        Action::PlayAlly {
            card, sacrifice_ally, ..
        } => {
            if card == Card::Rococo {
                // On-enter 2 when influence is low after pay; unique replacement also
                // routes through GY (ordering only — over-approx is fine).
                return state.influence() <= 5
                    || state.allies[..state.ally_len as usize]
                        .iter()
                        .any(|ally| ally.card() == Card::Rococo);
            }
            if card == Card::PepperedChef
                && let Some(index) = sacrifice_ally
                && (index as usize) < state.ally_len as usize
            {
                return state.allies[index as usize].card().on_death_damage() > 0;
            }
            if card.is_unique()
                && state.allies[..state.ally_len as usize]
                    .iter()
                    .any(|ally| ally.card() == card)
            {
                return state.allies[..state.ally_len as usize]
                    .iter()
                    .any(|ally| ally.card() == card && ally.card().on_death_damage() > 0);
            }
            false
        }
        _ => false,
    }
}

/// Drop Mate-ending actions that land on the same post-Mate memo key.
/// On collision keep the sibling with higher incoming damage (exact if a future
/// Mate-ender deals damage mid-phase); ties keep the first action.
fn collapse_mate_ending_siblings(state: State, endings: Vec<Action>) -> Vec<Action> {
    if endings.len() <= 1 {
        return endings;
    }
    let mut best: FxHashMap<State, (Action, u8)> =
        FxHashMap::with_capacity_and_hasher(endings.len(), Default::default());
    let mut order: Vec<State> = Vec::with_capacity(endings.len());
    for action in endings {
        let after = apply_silent(state, action);
        let damage = after.damage;
        let key = memo_board_key(after);
        match best.get(&key) {
            Some(&(_, prev_damage)) if damage <= prev_damage => {}
            Some(_) => {
                best.insert(key, (action, damage));
            }
            None => {
                order.push(key);
                best.insert(key, (action, damage));
            }
        }
    }
    order.into_iter().map(|key| best[&key].0).collect()
}

fn actions(state: State, glimpse_enabled: bool, full_glimpse_layouts: bool) -> Vec<Action> {
    if state.phase == Phase::Agility {
        let mut result = Vec::with_capacity(24);
        if state.tristan_leveled && state.agility >= 3 && state.memory_len >= 3 {
            result.push(Action::TristanRecollect);
        }
        push_fast_plays(state, &mut result);
        result.push(Action::SkipAgility);
        return result;
    }

    if state.phase == Phase::Materialize {
        let mut endings = Vec::with_capacity(16);
        // Mercenary's Blade in Mate: champion must already be leveled.
        if state.turn >= 1 {
            if state.has_material(MAT_HAMMER) {
                endings.push(Action::MaterializeHammer);
            }
            if state.is_assassin() && state.prep > 0 && state.has_material(MAT_BLADE) {
                endings.push(Action::MercenaryBlade);
            }
        }
        // Solver reduction: Poisoned Dagger is always taken on the first Materialize window.
        if state.turn == 1 && state.has_material(MAT_DAGGER) {
            endings.push(Action::MaterializeDagger);
        }
        if state.turn >= 1
            && state.champion_level == 0
            && state.has_material(MAT_ZANDER)
            && (state.memory_len > 0 || state.float_gy > 0)
        {
            if glimpse_enabled && state.queue_pos < state.queue_len {
                let layouts = if full_glimpse_layouts {
                    state.glimpse_playtest_layouts()
                } else {
                    state.glimpse_relevant_layouts()
                };
                if layouts.is_empty() {
                    // No remaining deck draws — Glimpse cannot change outcomes.
                    endings.push(Action::MaterializeZanderMemory {
                        glimpse_layout: None,
                    });
                } else {
                    for layout in layouts {
                        endings.push(Action::MaterializeZanderMemory {
                            glimpse_layout: Some(layout),
                        });
                    }
                }
            } else {
                endings.push(Action::MaterializeZanderMemory {
                    glimpse_layout: None,
                });
            }
        }
        if state.turn >= 1
            && !state.tristan_leveled
            && state.has_material(MAT_TRISTAN)
            && (state.memory_len > 0 || state.float_gy > 0)
        {
            endings.push(Action::MaterializeTristanMemory);
        }
        if state.turn >= 1
            && state.is_assassin()
            && state.has_material(MAT_RIPPER)
            && (state.memory_len > 0 || state.float_gy > 0)
        {
            endings.push(Action::MaterializeRipper);
        }
        if state.turn >= 1 && state.has_material(MAT_RING) {
            endings.push(Action::MaterializeRing);
        }
        endings.push(Action::SkipMaterialize);
        let endings = collapse_mate_ending_siblings(state, endings);

        // Preserve prior order: materializes → fast plays → Skip.
        let mut result = Vec::with_capacity(endings.len().saturating_add(8));
        for action in endings.iter().copied() {
            if !matches!(action, Action::SkipMaterialize) {
                result.push(action);
            }
        }
        push_fast_plays(state, &mut result);
        if endings
            .iter()
            .any(|action| matches!(action, Action::SkipMaterialize))
        {
            result.push(Action::SkipMaterialize);
        }
        return result;
    }

    // Safe reduction: activating Poisoned Dagger first always weakly dominates.
    // Amplify sticks for the rest of the turn and buffs every later damage hit.
    if state.dagger && state.dagger_ready {
        return vec![Action::ActivateDagger];
    }

    let mut result = Vec::with_capacity(48);

    for index in 0..state.ally_len as usize {
        if state.allies[index].card() == Card::Sadi && state.hand_len >= 2 {
            result.push(Action::ActivateSadi(index as u8));
        }
    }

    let mut arthur_ready = false;
    for index in 0..state.ally_len as usize {
        if state.allies[index].card() == Card::Arthur && state.can_ally_attack(index) {
            result.push(Action::AttackArthur(index as u8));
            arthur_ready = true;
            break;
        }
    }
    // Safe reduction: never attack other allies while Arthur can still attack.
    // Resting Arthur first always dominates for the +1 rested buff.
    if !arthur_ready
        && (0..state.ally_len as usize)
            .any(|index| state.allies[index].card() != Card::Arthur && state.can_ally_attack(index))
    {
        result.push(Action::AttackOthers);
    }

    for card in ALL_CARDS {
        if !card.is_ally() || !state.has(card) {
            continue;
        }
        let max_kindle = card.kindle().min(state.fire_gy).min(card.cost());
        for kindle in 0..=max_kindle {
            let reserve = card.cost().saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            if card == Card::PepperedChef {
                push_peppered_chef_plays(state, card, kindle, &mut result);
            }
            if state.hot_cake > 0 {
                result.push(Action::PlayAlly {
                    card,
                    kindle,
                    sacrifice_ally: None,
                    hot_cake_sacrifice: true,
                    flagrant_level: None,
                    flagrant_gy_return: None,
                });
            }
            if card == Card::FlagrantGuide {
                result.extend(flagrant_guide_actions(state, card, kindle, None, false));
            }
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally: None,
                hot_cake_sacrifice: false,
                flagrant_level: None,
                flagrant_gy_return: None,
            });
        }
    }

    for card in ALL_CARDS {
        if !card.is_item() || !state.has(card) {
            continue;
        }
        if state.hand_len.saturating_sub(1) < card.cost() {
            continue;
        }
        result.push(Action::PlayItem { card });
    }

    if state.champion_awake && !(state.go_first && state.turn == 0) {
        for card in [
            Card::IgnitedStab,
            Card::RendingFlames,
            Card::HeatedVengeance,
            Card::ViciousSlice,
        ] {
            if !state.has(card) || state.hand_len.saturating_sub(1) < card.cost() {
                continue;
            }
            let mut wield_options = vec![None];
            for weapon in Weapon::EQUIPPABLE {
                if state.has_weapon(weapon) {
                    wield_options.push(Some(weapon));
                }
            }
            let prep_options = card == Card::IgnitedStab && state.prep > 0 && state.is_assassin();
            let double =
                card == Card::RendingFlames && state.is_assassin() && state.fire_gy >= 3;
            for wield in wield_options {
                if prep_options {
                    result.push(Action::PlayAttack {
                        card,
                        wield,
                        prepared: true,
                        doubled: false,
                        command_ally: None,
                    });
                }
                result.push(Action::PlayAttack {
                    card,
                    wield,
                    prepared: false,
                    doubled: double,
                    command_ally: None,
                });
            }
        }
        for weapon in Weapon::EQUIPPABLE {
            if state.has_weapon(weapon) {
                result.push(Action::AttackWithWeapon(weapon));
            }
        }
    }

    // Command Automaton: an Automaton ally performs the attack (champion need not be awake).
    if !(state.go_first && state.turn == 0)
        && state.has(Card::UncannyRealization)
        && state.hand_len.saturating_sub(1) >= Card::UncannyRealization.cost()
    {
        for index in 0..state.ally_len as usize {
            let ally = state.allies[index];
            if !ally.card().is_automaton() || !ally.awake() {
                continue;
            }
            result.push(Action::PlayAttack {
                card: Card::UncannyRealization,
                wield: None,
                prepared: false,
                doubled: false,
                command_ally: Some(index as u8),
            });
        }
    }

    push_action_plays(state, &mut result);

    if state.has(Card::BlazingThrow)
        && state.any_weapon()
        && state.hand_len >= 2
        && !(state.go_first && state.turn == 0)
    {
        for weapon in Weapon::EQUIPPABLE {
            if state.has_weapon(weapon) {
                result.push(Action::BlazingThrow(weapon));
            }
        }
    }
    // Main: prep-paid materialization; champion need not be leveled yet.
    if state.prep > 0 && state.has_material(MAT_BLADE) {
        result.push(Action::MercenaryBlade);
    }
    if state.is_assassin()
        && state.prep > 0
        && state.has_weapon(Weapon::AssassinsRipper)
        && state.champion_awake
    {
        result.push(Action::ActivateRipper);
    }
    if state.prep > 0 {
        for index in 0..state.ally_len as usize {
            let ally = state.allies[index];
            if ally.card() == Card::CorhaziArsonist && !ally.stealth() {
                result.push(Action::ActivateArsonist(index as u8));
            }
        }
    }
    if state.is_assassin() && state.has_material(MAT_SOULKNIFE) && state.fire_gy >= 3 {
        result.push(Action::MaterializeSoulknife);
    }
    result.push(Action::Pass);
    result
}

fn tape_phase(state: &State) -> TapePhase {
    match state.phase {
        Phase::Materialize => TapePhase::Materialize,
        Phase::Agility => TapePhase::Agility,
        Phase::Main => TapePhase::Main,
    }
}

/// Legal player actions for interactive playtest (Glimpse enabled for Zander layouts).
pub fn legal_actions(state: State) -> Vec<Action> {
    actions(state, true, true)
}

fn solver_actions(state: State, glimpse_enabled: bool) -> Vec<Action> {
    actions(state, glimpse_enabled, false)
}

/// Manual reserve / discard selection for interactive playtest.
#[derive(Clone, Debug)]
pub struct ActionPayment {
    pub reserved: Vec<Card>,
    pub discard: DiscardPayment,
}

/// How to resolve an optional discard effect during playtest apply.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DiscardPayment {
    Auto,
    Skip,
    Card(Card),
}

impl Default for DiscardPayment {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Clone, Copy, Debug)]
pub struct PaymentRequirement {
    pub reserve: u8,
    pub fire_only: bool,
    pub played_card: Option<Card>,
}

#[derive(Clone, Copy, Debug)]
pub struct DiscardRequirement {
    pub optional: bool,
    pub draw_before_discard: bool,
}

fn resolve_discard(state: &mut State, payment: DiscardPayment) -> Option<Card> {
    match payment {
        DiscardPayment::Auto => state.discard_for_effect(),
        DiscardPayment::Skip => None,
        DiscardPayment::Card(card) => {
            if !state.remove_hand(card) {
                return None;
            }
            state.send_to_gy(card);
            Some(card)
        }
    }
}

fn ally_attack_discard_requirement(state: State, card: Card) -> Option<DiscardRequirement> {
    match card {
        Card::HastyMessenger | Card::RedHare if state.hand_len > 0 => Some(DiscardRequirement {
            optional: true,
            draw_before_discard: false,
        }),
        Card::CorhaziCourier if state.is_assassin() => Some(DiscardRequirement {
            optional: false,
            draw_before_discard: true,
        }),
        _ => None,
    }
}

pub fn action_discard_required(state: State, action: Action) -> Option<DiscardRequirement> {
    match action {
        Action::PlayAlly { card, kindle, .. } if card == Card::PackageCourier => {
            let kindle = kindle.min(card.cost()).min(state.fire_gy);
            let reserve = card.cost().saturating_sub(kindle);
            if state.hand_len > reserve + 1 {
                Some(DiscardRequirement {
                    optional: true,
                    draw_before_discard: false,
                })
            } else {
                None
            }
        }
        Action::AttackArthur(index) => {
            let index = index as usize;
            if index >= state.ally_len as usize {
                return None;
            }
            ally_attack_discard_requirement(state, state.allies[index].card())
        }
        Action::AttackOthers => {
            for index in 0..state.ally_len as usize {
                if state.allies[index].card() == Card::Arthur || !state.can_ally_attack(index) {
                    continue;
                }
                if let Some(req) = ally_attack_discard_requirement(state, state.allies[index].card()) {
                    return Some(req);
                }
            }
            None
        }
        _ => None,
    }
}

/// Hand slots (and optional newly drawn index) shown when picking a discard in playtest.
pub fn action_discard_hand(state: State, action: Action) -> Option<(Vec<Card>, Option<u8>)> {
    let req = action_discard_required(state, action)?;
    if req.draw_before_discard {
        simulate_draw_before_discard(state, action)
    } else {
        Some((state.hand_slots(), None))
    }
}

fn simulate_draw_before_discard(mut state: State, action: Action) -> Option<(Vec<Card>, Option<u8>)> {
    match action {
        Action::AttackArthur(index) => {
            let index = index as usize;
            if index >= state.ally_len as usize {
                return None;
            }
            let card = state.allies[index].card();
            if card == Card::CorhaziCourier && state.is_assassin() {
                let before_count = state.hand;
                let drawn = state.draw_unknown();
                let slots = state.hand_slots();
                let drawn_index = drawn_slot_index(&slots, drawn, before_count[drawn.index()]);
                Some((slots, drawn_index))
            } else {
                None
            }
        }
        Action::AttackOthers => {
            for index in 0..state.ally_len as usize {
                if state.allies[index].card() == Card::Arthur || !state.can_ally_attack(index) {
                    continue;
                }
                let card = state.allies[index].card();
                if card == Card::CorhaziCourier && state.is_assassin() {
                    let before_count = state.hand;
                    let drawn = state.draw_unknown();
                    let slots = state.hand_slots();
                    let drawn_index = drawn_slot_index(&slots, drawn, before_count[drawn.index()]);
                    return Some((slots, drawn_index));
                }
            }
            None
        }
        _ => None,
    }
}

fn drawn_slot_index(slots: &[Card], drawn: Card, before_count: u8) -> Option<u8> {
    let mut seen = 0u8;
    for (index, card) in slots.iter().enumerate() {
        if *card == drawn {
            seen += 1;
            if seen > before_count {
                return Some(index as u8);
            }
        }
    }
    None
}

pub fn action_payment_required(state: State, action: Action) -> Option<PaymentRequirement> {
    match action {
        Action::PlayAlly { card, kindle, .. } => {
            let kindle = kindle.min(card.cost()).min(state.fire_gy);
            Some(PaymentRequirement {
                reserve: card.cost().saturating_sub(kindle),
                fire_only: false,
                played_card: Some(card),
            })
        }
        Action::PlayAction {
            card,
            kindle,
            imbue,
            ..
        } => {
            let cost = action_cost(&state, card);
            let kindle = kindle.min(cost).min(state.fire_gy);
            Some(PaymentRequirement {
                reserve: cost.saturating_sub(kindle),
                fire_only: imbue && card.imbue() > 0,
                played_card: Some(card),
            })
        }
        Action::PlayItem { card } => Some(PaymentRequirement {
            reserve: card.cost(),
            fire_only: false,
            played_card: Some(card),
        }),
        Action::PlayAttack { card, .. } => Some(PaymentRequirement {
            reserve: card.cost(),
            fire_only: false,
            played_card: Some(card),
        }),
        Action::BlazingThrow(_) => Some(PaymentRequirement {
            reserve: 1,
            fire_only: false,
            played_card: Some(Card::BlazingThrow),
        }),
        _ => None,
    }
}

/// Apply one action and return the next board state plus combat-tape events.
pub fn apply_action(state: State, action: Action) -> (State, Vec<LineEvent>) {
    apply_action_with_payment(state, action, None)
}

/// Apply one action with optional manual reserve payment (playtest).
pub fn apply_action_with_payment(
    state: State,
    action: Action,
    payment: Option<ActionPayment>,
) -> (State, Vec<LineEvent>) {
    let mut tape = EventTape::new();
    let next = apply_into(state, action, &mut tape, payment.as_ref());
    (next, tape.events)
}

#[cfg(test)]
fn apply(state: State, action: Action) -> (State, Vec<LineEvent>) {
    apply_action(state, action)
}

/// Search expansion: mutate the board without allocating combat-tape snapshots.
fn apply_silent(state: State, action: Action) -> State {
    thread_local! {
        static TAPE: RefCell<EventTape> = RefCell::new(EventTape::silent());
    }
    TAPE.with(|tape| apply_into(state, action, &mut tape.borrow_mut(), None))
}

/// Return freed heap pages to the OS after a heavy solve.
///
/// glibc-specific: `malloc_trim` only trims the *main arena*, while rayon
/// workers allocate in per-thread arenas — expect modest returns, which is
/// why this runs once per hand rather than per rollout. A musl base image
/// has no such symbol and would fail to link.
#[cfg(target_os = "linux")]
fn release_process_memory() {
    unsafe {
        libc_malloc_trim(0);
    }
}

#[cfg(target_os = "linux")]
unsafe extern "C" {
    #[link_name = "malloc_trim"]
    fn libc_malloc_trim(pad: usize) -> i32;
}

#[cfg(not(target_os = "linux"))]
fn release_process_memory() {}

fn apply_into(
    mut state: State,
    action: Action,
    tape: &mut EventTape,
    payment: Option<&ActionPayment>,
) -> State {
    let reserved = payment.map(|payment| payment.reserved.as_slice());
    let mut discard = payment.map(|p| p.discard).unwrap_or(DiscardPayment::Auto);
    tape.begin_action(ActionOp::from_action(action));
    match action {
        Action::Pass => begin_agility_after_pass(&mut state, tape),
        Action::SkipAgility => finish_agility_phase(&mut state, tape),
        Action::SkipMaterialize => finish_materialization(&mut state, tape),
        Action::MaterializeHammer => {
            state.remove_material(MAT_HAMMER);
            state.equip_weapon(Weapon::ImpactHammer);
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeHammer,
                EventFields::default(),
            );
            finish_materialization(&mut state, tape);
        }
        Action::MaterializeDagger => {
            state.remove_material(MAT_DAGGER);
            state.dagger = true;
            state.dagger_ready = false;
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeDagger,
                EventFields::default(),
            );
            finish_materialization(&mut state, tape);
        }
        Action::MaterializeZanderMemory { glimpse_layout } => {
            state.remove_material(MAT_ZANDER);
            let from_memory = state.pay_zander_memory_cost();
            let fields = if from_memory {
                EventFields::default().from_memory()
            } else {
                EventFields::default()
            };
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::FloatForZander,
                fields,
            );
            if let Some(layout) = glimpse_layout {
                let glimpsed = state.glimpse_peek();
                state.apply_glimpse_layout(layout);
                if !glimpsed.is_empty() {
                    let mut glimpse_fields = EventFields::default();
                    if let Some(first) = glimpsed.first() {
                        glimpse_fields.card = Some(*first);
                    }
                    if let Some(second) = glimpsed.get(1) {
                        glimpse_fields.drawn = Some(*second);
                    }
                    tape.push(
                        state,
                        TapePhase::Materialize,
                        EventKind::Glimpse,
                        glimpse_fields,
                    );
                }
            }
            level_zander(&mut state, tape, TapePhase::Materialize);
            finish_materialization(&mut state, tape);
        }
        Action::MaterializeTristanMemory => {
            state.remove_material(MAT_TRISTAN);
            let from_memory = state.pay_champion_memory_cost();
            let fields = if from_memory {
                EventFields::default().from_memory()
            } else {
                EventFields::default()
            };
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::FloatForTristan,
                fields,
            );
            level_tristan(&mut state, tape, TapePhase::Materialize);
            finish_materialization(&mut state, tape);
        }
        Action::TristanRecollect => {
            state.agility = state.agility.saturating_sub(3);
            let recollected = state.recollect_from_memory(3);
            let mut fields = EventFields::default();
            if let Some(&card) = recollected.first() {
                fields.card = Some(card);
            }
            if let Some(&card) = recollected.get(1) {
                fields.drawn = Some(card);
            }
            if let Some(&card) = recollected.get(2) {
                fields.discarded = Some(card);
            }
            tape.push(
                state,
                TapePhase::Agility,
                EventKind::TristanRecollect,
                fields,
            );
        }
        Action::MaterializeSoulknife => {
            state.remove_material(MAT_SOULKNIFE);
            state.banish_fire_from_gy(3, false);
            state.equip_weapon(Weapon::VaruckanSoulknife);
            tape.push(
                state,
                TapePhase::Main,
                EventKind::MaterializeSoulknife,
                EventFields::default(),
            );
        }
        Action::MaterializeRipper => {
            state.remove_material(MAT_RIPPER);
            let from_memory = state.pay_champion_memory_cost();
            let fields = if from_memory {
                EventFields::default().from_memory()
            } else {
                EventFields::default()
            };
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::FloatForRipper,
                fields,
            );
            state.equip_weapon(Weapon::AssassinsRipper);
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeRipper,
                EventFields::default(),
            );
            finish_materialization(&mut state, tape);
        }
        Action::MaterializeRing => {
            state.remove_material(MAT_RING);
            state.ring_banished = true;
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeRing,
                EventFields::default(),
            );
            // Always banish immediately — there is no "hold the ring for later" line.
            let drawn = state.draw_unknown();
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::BanishCrusaderRing,
                EventFields::default().with_drawn(drawn),
            );
            finish_materialization(&mut state, tape);
        }
        Action::ActivateDagger => {
            state.dagger = false;
            state.dagger_ready = false;
            state.add_damage(1);
            state.amplify = state.is_assassin();
            tape.push(
                state,
                TapePhase::Main,
                EventKind::ActivateDagger,
                EventFields::default(),
            );
        }
        Action::ActivateRipper => {
            state.prep = state.prep.saturating_sub(1);
            state.weapon_power_bonus = 2;
            state.champion_awake = false;
            tape.push(
                state,
                TapePhase::Main,
                EventKind::ActivateRipper,
                EventFields::default(),
            );
        }
        Action::BanishCrusaderRing => {
            // Legacy / defensive: Ring now banishes as part of MaterializeRing.
            if state.ring {
                state.ring = false;
                state.ring_banished = true;
                let drawn = state.draw_unknown();
                tape.push(
                    state,
                    TapePhase::Main,
                    EventKind::BanishCrusaderRing,
                    EventFields::default().with_drawn(drawn),
                );
            }
        }
        Action::ActivateSadi(index) => {
            if state.pay_reserve(2) {
                state.remove_ally(index as usize, false);
                state.add_hand(Card::Sadi);
                state.prep = state.prep.saturating_add(1);
                tape.push(
                    state,
                    TapePhase::Main,
                    EventKind::SadiBounce,
                    EventFields::default(),
                );
            }
        }
        Action::AttackArthur(index) => attack_ally(&mut state, index as usize, tape, discard),
        Action::AttackOthers => {
            let mut index = 0;
            while index < state.ally_len as usize {
                if state.allies[index].card() != Card::Arthur && state.can_ally_attack(index) {
                    let card = state.allies[index].card();
                    let pay = if discard != DiscardPayment::Auto
                        && ally_attack_discard_requirement(state, card).is_some()
                    {
                        let pay = discard;
                        discard = DiscardPayment::Auto;
                        pay
                    } else {
                        DiscardPayment::Auto
                    };
                    attack_ally(&mut state, index, tape, pay);
                }
                index += 1;
            }
        }
        Action::PlayAlly {
            card,
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return,
        } => play_ally(
            &mut state,
            card,
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return,
            reserved,
            discard,
            tape,
        ),
        Action::PlayItem { card } => play_item(&mut state, card, reserved, tape),
        Action::PlayAttack {
            card,
            wield,
            prepared,
            doubled,
            command_ally,
        } => play_attack(
            &mut state,
            card,
            wield,
            prepared,
            doubled,
            command_ally,
            reserved,
            tape,
        ),
        Action::PlayAction {
            card,
            kindle,
            prepared,
            imbue,
            sacrifice_ally,
        } => play_action(
            &mut state,
            card,
            kindle,
            prepared,
            imbue,
            sacrifice_ally,
            reserved,
            tape,
        ),
        Action::ActivateArsonist(index) => {
            let index = index as usize;
            if state.prep > 0
                && index < state.ally_len as usize
                && state.allies[index].card() == Card::CorhaziArsonist
                && !state.allies[index].stealth()
            {
                state.prep = state.prep.saturating_sub(1);
                state.allies[index].set_stealth(true);
                tape.push(
                    state,
                    TapePhase::Main,
                    EventKind::ArsonistStealth,
                    EventFields::card(Card::CorhaziArsonist),
                );
            }
        }
        Action::BlazingThrow(weapon) => {
            if let Some(cards) = reserved {
                if state.pay_reserve_selection(cards, false).is_none() {
                    return state;
                }
                if !state.remove_hand(Card::BlazingThrow) {
                    return state;
                }
            } else if !state.remove_hand(Card::BlazingThrow) {
                return state;
            } else {
                state.pay_reserve(1);
            }
            state.remove_weapon(weapon);
            state.send_to_gy(Card::BlazingThrow);
            state.add_damage(4);
            tape.push(
                state,
                TapePhase::Main,
                EventKind::Play,
                EventFields::card(Card::BlazingThrow).with_weapon(weapon),
            );
        }
        Action::MercenaryBlade => {
            state.remove_material(MAT_BLADE);
            state.prep -= 1;
            state.equip_weapon(Weapon::MercenaryBlade);
            let phase = tape_phase(&state);
            tape.push(
                state,
                phase,
                EventKind::MaterializeBlade,
                EventFields::default(),
            );
            if state.phase == Phase::Materialize {
                finish_materialization(&mut state, tape);
            }
        }
        Action::AttackWithWeapon(weapon) => attack_with_weapon(&mut state, weapon, tape),
    }
    state
}

fn attack_with_weapon(state: &mut State, weapon: Weapon, tape: &mut EventTape) {
    if !state.has_weapon(weapon) || !state.champion_awake {
        return;
    }
    let power = state.weapon_power(weapon);
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::WieldForAttack,
        EventFields::default().with_weapon(weapon),
    );
    state.consume_weapon(weapon);
    state.champion_awake = false;
    state.add_damage(power);
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::WeaponAttack,
        EventFields::default().with_weapon(weapon),
    );
    apply_weapon_wield_self_damage(state, weapon, tape);
}

fn apply_weapon_wield_self_damage(state: &mut State, weapon: Weapon, tape: &mut EventTape) {
    if weapon == Weapon::ImpactHammer {
        state.champion_damaged = true;
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::HammerSelf,
            EventFields::default(),
        );
    }
}

// Hot search path: the payload mirrors Action::PlayAlly's fields, and grouping
// them into a struct would add indirection without clarifying the call sites.
#[expect(clippy::too_many_arguments)]
fn play_ally(
    state: &mut State,
    card: Card,
    kindle: u8,
    sacrifice_ally: Option<u8>,
    hot_cake_sacrifice: bool,
    flagrant_level: Option<u16>,
    flagrant_gy_return: Option<Card>,
    reserved: Option<&[Card]>,
    discard: DiscardPayment,
    tape: &mut EventTape,
) {
    if let Some(cards) = reserved {
        if !state.pay_with_kindle_selection(card.cost(), kindle, cards, false) {
            return;
        }
        if !state.remove_hand(card) {
            return;
        }
    } else {
        state.remove_hand(card);
        state.pay_with_kindle(card.cost(), kindle);
    }
    let arthur = card == Card::Arthur;
    let immortal = arthur;
    let phase = tape_phase(state);
    let mut sacrificed = false;
    if card == Card::PepperedChef
        && let Some(index) = sacrifice_ally
    {
        let index = index as usize;
        if index < state.ally_len as usize
            && state.allies[index].card() != Card::Arthur
            && let Some(victim) = state.remove_ally(index, true)
        {
            sacrificed = true;
            push_ally_gy_death(state, victim, phase, tape);
            tape.push(
                *state,
                phase,
                EventKind::Sacrifice,
                EventFields::card(victim),
            );
        }
    }
    // Unique: playing a second copy kills the one already on the board.
    if card.is_unique()
        && let Some(index) =
            (0..state.ally_len as usize).find(|&index| state.allies[index].card() == card)
        && let Some(victim) = state.remove_ally(index, true)
    {
        push_ally_gy_death(state, victim, phase, tape);
        tape.push(
            *state,
            phase,
            EventKind::UniqueDies,
            EventFields::card(victim),
        );
    }
    state.add_ally(card, !arthur, immortal);
    let mut fields = EventFields::card(card).with_kindle(kindle);
    if card.is_fast() && is_fast_phase(state.phase) {
        fields = fields.fast();
    }
    tape.push(*state, phase, EventKind::Play, fields);
    if arthur {
        tape.push(
            *state,
            phase,
            EventKind::Immortalize,
            EventFields::default(),
        );
    } else if card == Card::ClumsyApprentice {
        let drawn = state.draw_unknown();
        tape.push(
            *state,
            phase,
            EventKind::OnEnterDraw,
            EventFields::default().with_drawn(drawn),
        );
    } else if card == Card::PackageCourier {
        // On Enter: You may discard a card. If you do, draw a card.
        if let Some(discarded) = resolve_discard(state, discard) {
            let drawn = state.draw_unknown();
            tape.push(
                *state,
                phase,
                EventKind::OnEnterDraw,
                EventFields::card(card)
                    .with_discarded(discarded)
                    .with_drawn(drawn),
            );
        }
    } else if card == Card::Rococo {
        let influence = state.influence();
        if influence <= 4 {
            state.add_damage(2);
            tape.push(
                *state,
                phase,
                EventKind::OnEnterDamage,
                EventFields::card(Card::Rococo),
            );
        }
    } else if card == Card::FlagrantGuide {
        if let Some(mat) = flagrant_level {
            apply_flagrant_level(state, card, mat, flagrant_gy_return, phase, tape);
        }
    } else if card == Card::PepperedChef && sacrificed {
        state.agility = state.agility.saturating_add(2);
        tape.push(*state, phase, EventKind::ChefBuff, EventFields::default());
    }
    if hot_cake_sacrifice && state.hot_cake > 0 {
        state.hot_cake -= 1;
        state.send_to_gy(Card::HotCake);
        let index = state.ally_len as usize - 1;
        state.allies[index].set_attack_buff(state.allies[index].attack_buff().saturating_add(3));
        tape.push(
            *state,
            phase,
            EventKind::HotCakeSacrifice,
            EventFields::default(),
        );
    }
}

fn play_item(state: &mut State, card: Card, reserved: Option<&[Card]>, tape: &mut EventTape) {
    if let Some(cards) = reserved {
        if state.pay_reserve_selection(cards, false).is_none() {
            return;
        }
        if !state.remove_hand(card) {
            return;
        }
    } else {
        state.remove_hand(card);
        state.pay_reserve(card.cost());
    }
    if card == Card::HotCake {
        state.hot_cake = state.hot_cake.saturating_add(1);
    }
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::Play,
        EventFields::card(card),
    );
}

fn attack_ally(state: &mut State, index: usize, tape: &mut EventTape, discard: DiscardPayment) {
    let ally = state.allies[index];
    let card = ally.card();
    let arthur_buff = u8::from(card != Card::Arthur && state.arthur_rested());
    let hot_cake_buff = ally.attack_buff();
    if hot_cake_buff > 0 {
        state.allies[index].set_attack_buff(0);
    }
    let mut power = state.ally_power(ally);
    if card == Card::PepperedChef && state.agility > 0 {
        let buff = state.agility.min(2);
        power = power.saturating_add(buff);
        state.agility = state.agility.saturating_sub(buff);
    }
    power = power.saturating_add(hot_cake_buff);
    state.add_damage(power);
    state.allies[index].set_awake(false);
    let bonuses = AttackBonuses {
        arthur: arthur_buff,
        hot_cake: hot_cake_buff,
        unique: 0,
        ally_attack: 0,
    };
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::AllyAttack,
        EventFields::card(card).with_bonuses(bonuses),
    );
    if card == Card::CaptivatingCutthroat && state.is_assassin() {
        state.champion_damaged = true;
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::CutthroatSelf,
            EventFields::default(),
        );
    }
    if matches!(card, Card::HastyMessenger | Card::RedHare)
        && let Some(discarded) = resolve_discard(state, discard)
    {
        let drawn = state.draw_unknown();
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::OnAttackDraw,
            EventFields::default()
                .with_discarded(discarded)
                .with_drawn(drawn),
        );
    }
    if card == Card::CorhaziCourier && state.is_assassin() {
        let drawn = state.draw_unknown();
        if let Some(discarded) = resolve_discard(state, discard) {
            if discarded.is_fire() {
                state.add_damage(1);
            }
            tape.push(
                *state,
                TapePhase::Main,
                EventKind::CorhaziOnHit,
                EventFields::default()
                    .with_drawn(drawn)
                    .with_discarded(discarded),
            );
        }
    }
}

fn play_attack(
    state: &mut State,
    card: Card,
    wield: Option<Weapon>,
    prepared: bool,
    doubled: bool,
    command_ally: Option<u8>,
    reserved: Option<&[Card]>,
    tape: &mut EventTape,
) {
    if card.is_command_automaton() {
        let Some(index) = command_ally.map(|i| i as usize) else {
            return;
        };
        if index >= state.ally_len as usize {
            return;
        }
        let ally = state.allies[index];
        if !ally.card().is_automaton() || !ally.awake() {
            return;
        }

        if let Some(cards) = reserved {
            if state.pay_reserve_selection(cards, false).is_none() {
                return;
            }
            if !state.remove_hand(card) {
                return;
            }
        } else {
            state.remove_hand(card);
            state.pay_reserve(card.cost());
        }
        let ally_attack = ally.card().power();
        let unique_bonus = u8::from(ally.card().is_unique()) * 2;
        let arthur_buff = u8::from(ally.card() != Card::Arthur && state.arthur_rested());
        let hot_cake_buff = ally.attack_buff();
        if hot_cake_buff > 0 {
            state.allies[index].set_attack_buff(0);
        }
        let power = card
            .power()
            .saturating_add(ally_attack)
            .saturating_add(unique_bonus)
            .saturating_add(arthur_buff)
            .saturating_add(hot_cake_buff);
        state.send_to_gy(card);
        state.allies[index].set_awake(false);
        state.add_damage(power);

        let bonuses = AttackBonuses {
            arthur: arthur_buff,
            hot_cake: hot_cake_buff,
            unique: unique_bonus,
            ally_attack,
        };
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::Play,
            EventFields::card(card)
                .with_command_ally(ally.card())
                .with_bonuses(bonuses),
        );
        return;
    }

    if let Some(cards) = reserved {
        if state.pay_reserve_selection(cards, false).is_none() {
            return;
        }
        if !state.remove_hand(card) {
            return;
        }
    } else {
        state.remove_hand(card);
        state.pay_reserve(card.cost());
    }
    let mut power = card.power();
    if card == Card::IgnitedStab && prepared {
        state.prep -= 1;
        power += 2;
    }
    let heated_bonus = card == Card::HeatedVengeance && state.champion_damaged;
    if heated_bonus {
        power += 3;
    }
    // Champions are Human; Class Bonus +1 always applies while Assassin.
    let human_bonus = card == Card::ViciousSlice && state.is_assassin();
    if human_bonus {
        power += 1;
    }
    let mut wielded = Weapon::None;
    if let Some(weapon) = wield.filter(|&weapon| state.has_weapon(weapon)) {
        wielded = weapon;
        power += state.weapon_power(weapon);
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::WieldForAttack,
            EventFields::default().with_weapon(wielded),
        );
        state.consume_weapon(wielded);
    }
    state.champion_awake = false;

    let mut fields = EventFields::card(card);
    if card == Card::IgnitedStab {
        fields = fields.with_prepared(prepared);
    }
    if heated_bonus {
        fields = fields.heated();
    }
    if human_bonus {
        fields = fields.human();
    }
    if wielded != Weapon::None {
        fields = fields.with_weapon(wielded);
    }

    if card == Card::RendingFlames && doubled && state.fire_gy >= 3 {
        // Banish three Fire already in the GY; the attacking copy cannot pay its own cost.
        state.banish_fire_from_gy(3, false);
        state.send_to_gy(card);
        state.add_damage(power * 2);
        tape.push(*state, TapePhase::Main, EventKind::Play, fields.doubled());
    } else {
        state.send_to_gy(card);
        state.add_damage(power);
        tape.push(*state, TapePhase::Main, EventKind::Play, fields);
    }
    apply_weapon_wield_self_damage(state, wielded, tape);
}

fn play_action(
    state: &mut State,
    card: Card,
    kindle: u8,
    prepared: bool,
    imbue: bool,
    sacrifice_ally: Option<u8>,
    reserved: Option<&[Card]>,
    tape: &mut EventTape,
) {
    // Additional cost legality (Undeniable Truth): the ally must exist.
    if let Some(index) = sacrifice_ally
        && index as usize >= state.ally_len as usize
    {
        return;
    }
    let cost = action_cost(state, card);
    let imbued = match reserved {
        Some(cards) => {
            let imbued = if card.imbue() == 0 {
                if !state.pay_with_kindle_selection(cost, kindle, cards, imbue) {
                    return;
                }
                false
            } else if imbue {
                if !state.pay_imbue_cost_selection(cost, card.imbue(), kindle, true, cards) {
                    return;
                }
                true
            } else {
                let imbue_n = card.imbue();
                let kindle_capped = kindle.min(cost).min(state.fire_gy);
                let reserve = cost.saturating_sub(kindle_capped);
                if cards.len() != reserve as usize {
                    return;
                }
                let Some(all_fire) = state.pay_reserve_selection(cards, false) else {
                    return;
                };
                let marched = state.banish_fire_from_gy(kindle_capped, true);
                for _ in 0..marched {
                    let already = state.allies[..state.ally_len as usize]
                        .iter()
                        .any(|ally| ally.card() == Card::MarchHare);
                    if !already {
                        state.add_ally(Card::MarchHare, true, false);
                    }
                }
                reserve >= imbue_n && all_fire
            };
            if !state.remove_hand(card) {
                return;
            }
            let phase = tape_phase(state);
            if let Some(index) = sacrifice_ally
                && let Some(victim) = state.remove_ally(index as usize, true)
            {
                push_ally_gy_death(state, victim, phase, tape);
                tape.push(
                    *state,
                    phase,
                    EventKind::Sacrifice,
                    EventFields::card(victim),
                );
            }
            imbued
        }
        None => {
            state.remove_hand(card);
            let phase = tape_phase(state);
            if let Some(index) = sacrifice_ally
                && let Some(victim) = state.remove_ally(index as usize, true)
            {
                push_ally_gy_death(state, victim, phase, tape);
                tape.push(
                    *state,
                    phase,
                    EventKind::Sacrifice,
                    EventFields::card(victim),
                );
            }
            state.pay_imbue_cost(cost, card.imbue(), kindle, imbue)
        }
    };

    if prepared && card.prepare() > 0 {
        state.prep = state.prep.saturating_sub(card.prepare());
    }
    state.send_to_gy(card);

    let mut drawn = None;
    let mut memory_draw = None;
    let damage = match card {
        Card::FieryInterference => 2,
        Card::MarkTheTarget => {
            if state.is_assassin() {
                state.prep = state.prep.saturating_add(1);
            }
            1
        }
        Card::PlantedExplosive if prepared => 4,
        Card::PlantedExplosive => 2,
        Card::IntensifiedPyre if state.gy_total >= 8 => 6,
        Card::IntensifiedPyre => 2,
        Card::VermilionDecree if imbued => {
            drawn = Some(state.draw_unknown());
            3
        }
        Card::VermilionDecree => 3,
        Card::Demolition => 3,
        Card::SurgingBolt if imbued => 4,
        Card::SurgingBolt => 3,
        Card::IgniteFate => {
            // Hits each champion; only the opponent's life is scored, but ours
            // registering damage enables Heated Vengeance.
            state.champion_damaged = true;
            2
        }
        Card::IncreasingDanger => {
            drawn = Some(state.draw_unknown());
            memory_draw = Some(state.draw_to_memory());
            0
        }
        Card::UndeniableTruth => {
            drawn = Some(state.draw_unknown());
            state.prep = state.prep.saturating_add(1);
            0
        }
        Card::SmokeOut => 1,
        Card::SparkAlight => 2,
        Card::FlurryOfFire => 1,
        // Incapacitate and Reduce to Ash have no modeled effect.
        _ => 0,
    };
    // Flurry of Fire deals 1 twice so Poisoned Dagger amplify applies per hit.
    if card == Card::FlurryOfFire {
        state.add_damage(1);
        state.add_damage(1);
    } else {
        state.add_damage(damage);
    }

    let mut fields = EventFields::card(card).with_kindle(kindle);
    if card.prepare() > 0 {
        fields = fields.with_prepared(prepared);
    }
    if imbued {
        fields = fields.with_imbue(true);
    }
    if let Some(drawn) = drawn {
        fields = fields.with_drawn(drawn);
    }
    if let Some(memory_draw) = memory_draw {
        fields = fields.with_memory_draw(memory_draw);
    }
    if card.is_fast() && is_fast_phase(state.phase) {
        fields = fields.fast();
    }
    if card == Card::IntensifiedPyre && damage == 6 {
        fields = fields.gy_threshold();
    }

    let phase = tape_phase(state);
    tape.push(*state, phase, EventKind::Play, fields);
}

fn level_tristan(state: &mut State, tape: &mut EventTape, phase: TapePhase) {
    state.tristan_leveled = true;
    state.champion_level = 1;
    state.prep = state.prep.saturating_add(1);
    tape.push(
        *state,
        phase,
        EventKind::LevelTristan,
        EventFields::default(),
    );
}

fn level_zander(state: &mut State, tape: &mut EventTape, phase: TapePhase) {
    state.champion_level = 1;
    state.prep = state.prep.saturating_add(1);
    tape.push(
        *state,
        phase,
        EventKind::LevelZander,
        EventFields::default(),
    );
}

fn level_zander2(
    state: &mut State,
    gy_return: Option<Card>,
    tape: &mut EventTape,
    phase: TapePhase,
) {
    state.champion_level = 2;
    state.prep = state.prep.saturating_add(2);
    tape.push(
        *state,
        phase,
        EventKind::LevelZander2,
        EventFields::default(),
    );
    if let Some(card) = gy_return {
        state.prep = state.prep.saturating_sub(1);
        state.remove_one_from_gy(card);
        state.add_hand(card);
        tape.push(
            *state,
            phase,
            EventKind::ZanderGyReturn,
            EventFields::default().with_drawn(card),
        );
    }
}

fn apply_flagrant_level(
    state: &mut State,
    card: Card,
    mat: u16,
    gy_return: Option<Card>,
    phase: TapePhase,
    tape: &mut EventTape,
) {
    let self_dmg = 6u8.saturating_add(4 * state.champion_level);
    state.champion_damaged = true;
    state.remove_material(mat);
    tape.push(
        *state,
        phase,
        EventKind::OnEnterLevel,
        EventFields::card(card).with_kindle(self_dmg),
    );
    if mat == MAT_ZANDER {
        level_zander(state, tape, phase);
    } else if mat == MAT_ZANDER_2 {
        level_zander2(state, gy_return, tape, phase);
    } else {
        level_tristan(state, tape, phase);
    }
}

fn finish_materialization(state: &mut State, tape: &mut EventTape) {
    tape.push(
        *state,
        TapePhase::Recollect,
        EventKind::MaterializeResolves,
        EventFields::default(),
    );
    let drawn = state.recollect();
    state.phase = Phase::Main;
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::Recollect,
        EventFields::default().with_drawn(drawn),
    );
}

fn begin_agility_after_pass(state: &mut State, tape: &mut EventTape) {
    tape.push(
        *state,
        TapePhase::Agility,
        EventKind::PassOpportunity,
        EventFields::default(),
    );
    if state.tristan_leveled {
        state.phase = Phase::Agility;
        return;
    }
    finish_agility_phase(state, tape);
}

fn finish_agility_phase(state: &mut State, tape: &mut EventTape) {
    tape.push(
        *state,
        TapePhase::End,
        EventKind::EndAgility,
        EventFields::default(),
    );
    advance_after_agility(state, tape);
}

fn advance_after_agility(state: &mut State, tape: &mut EventTape) {
    state.phase = Phase::Main;
    tape.push(
        *state,
        TapePhase::EnemyMain,
        EventKind::EndMain,
        EventFields::default(),
    );
    state.turn += 1;
    state.enemy_cull(Some(tape));
    tape.push(
        *state,
        TapePhase::EnemyEnd,
        EventKind::EnemyMain,
        EventFields::default(),
    );
    tape.push(
        *state,
        TapePhase::Wake,
        EventKind::Wake,
        EventFields::default(),
    );
    state.wake();
    tape.push(
        *state,
        TapePhase::Materialize,
        EventKind::Wake,
        EventFields::default(),
    );
    if !state.is_terminal() {
        state.phase = Phase::Materialize;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::line_event::format_line_event;
    use crate::model::ALL_MATERIALS;
    use crate::version::ENGINE_VERSION;

    fn labels(events: &[LineEvent]) -> Vec<String> {
        events.iter().map(format_line_event).collect()
    }

    #[test]
    fn opening_hand_hash_matches_sorted_sha256_of_card_ids() {
        // Same contract as apps/api handHash: SHA-256 of sorted ids joined by ",".
        let hand = [Card::IgnitedStab, Card::KingdomInformant, Card::Brick];
        let mut ids: Vec<&str> = hand.iter().map(|card| card.id()).collect();
        ids.sort_unstable();
        let expected = {
            use sha2::{Digest, Sha256};
            let digest = Sha256::digest(ids.join(",").as_bytes());
            hex_lower(&digest)
        };
        assert_eq!(opening_hand_hash(&hand), expected);
        // Order-independent.
        assert_eq!(
            opening_hand_hash(&[Card::Brick, Card::IgnitedStab, Card::KingdomInformant]),
            expected
        );
    }

    #[test]
    fn floating_memory_returns_at_recollect_and_banishes_for_zander() {
        let state = State::with_queue(
            &[Card::IgnitedStab, Card::KingdomInformant],
            false,
            2,
            &[Card::Brick],
        );
        let (after_play, _) = apply(
            state,
            Action::PlayAttack {
                card: Card::IgnitedStab,
                wield: None,
                prepared: false,
                doubled: false,
                command_ally: None,
            },
        );
        assert_eq!(after_play.memory[Card::KingdomInformant.index()], 1);

        let (after_pass, _) = apply(after_play, Action::Pass);
        let (after_recollect, _) = apply(after_pass, Action::SkipMaterialize);

        assert_eq!(after_recollect.float_gy, 0);
        assert!(
            after_recollect.has(Card::KingdomInformant),
            "floating memory should return to hand at recollect"
        );

        let mut for_zander = after_recollect;
        for_zander.champion_level = 0;
        for_zander.phase = Phase::Materialize;
        for_zander.turn = 1;
        for_zander.hand[Card::KingdomInformant.index()] = 0;
        for_zander.hand_len = for_zander.hand_len.saturating_sub(1);
        for_zander.memory[Card::KingdomInformant.index()] = 1;
        for_zander.memory_len = 1;

        let (after_zander, steps) = apply(
            for_zander,
            Action::MaterializeZanderMemory {
                glimpse_layout: None,
            },
        );
        assert_eq!(after_zander.memory_len, 0);
        assert_eq!(after_zander.float_gy, 0);
        assert!(!after_zander.has(Card::KingdomInformant));
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("from Mem")),
            "{steps:?}"
        );
    }

    #[test]
    fn increasing_danger_refused_when_it_spends_last_damage_hand() {
        // Smoke Out is the only damage play; paying ID reserves it → no Main damage left.
        let mut state = State::with_queue_and_materials(
            &[Card::IncreasingDanger, Card::SmokeOut, Card::Brick],
            false,
            2,
            &[Card::Brick, Card::Brick],
            0,
        );
        state.phase = Phase::Main;
        state.turn = 1; // final turn only
        state.champion_level = 1;
        state.champion_awake = true;

        let legal = solver_actions(state, false);
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::IncreasingDanger,
                    ..
                }
            )),
            "ID should not spend the last damage card: {legal:?}"
        );
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::SmokeOut,
                    ..
                }
            )),
            "{legal:?}"
        );
    }

    #[test]
    fn increasing_danger_allowed_on_earlier_turns_even_if_it_spends_damage() {
        let mut state = State::with_queue_and_materials(
            &[Card::IncreasingDanger, Card::SmokeOut, Card::Brick],
            false,
            2,
            &[Card::Brick, Card::Brick],
            0,
        );
        state.phase = Phase::Main;
        state.turn = 0;
        state.champion_level = 1;
        state.champion_awake = true;

        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::IncreasingDanger,
                    ..
                }
            )),
            "earlier turns may dig even if it spends this Main's damage: {legal:?}"
        );
    }

    #[test]
    fn increasing_danger_allowed_when_no_damage_play_exists() {
        let mut state = State::with_queue_and_materials(
            &[Card::IncreasingDanger, Card::Brick, Card::Brick],
            false,
            2,
            &[Card::Demolition, Card::Brick],
            0,
        );
        state.phase = Phase::Main;
        state.turn = 1;
        state.champion_level = 1;

        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::IncreasingDanger,
                    ..
                }
            )),
            "digging is fine when nothing damages yet: {legal:?}"
        );
    }

    #[test]
    fn undeniable_truth_refused_when_sacrifice_kills_last_damage() {
        // Awake ally is the only damage; Truth sacs it and pays the brick.
        let mut state = State::with_queue_and_materials(
            &[Card::UndeniableTruth, Card::Brick],
            false,
            2,
            &[Card::Brick, Card::Brick],
            0,
        );
        state.phase = Phase::Main;
        state.turn = 1;
        state.champion_level = 1;
        state.add_ally(Card::ClumsyApprentice, true, false);

        let legal = solver_actions(state, false);
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::UndeniableTruth,
                    ..
                }
            )),
            "Truth should not sac the only attacker: {legal:?}"
        );
        assert!(
            legal
                .iter()
                .any(|action| matches!(action, Action::AttackOthers)),
            "{legal:?}"
        );
    }

    #[test]
    fn undeniable_truth_kept_when_prep_enables_blade() {
        // Smoke Out is spendable damage now; Truth reserves it, but +prep unlocks Blade→swing.
        let mut state = State::with_queue_and_materials(
            &[Card::UndeniableTruth, Card::SmokeOut],
            false,
            2,
            &[],
            MAT_BLADE,
        );
        state.phase = Phase::Main;
        state.turn = 1;
        state.champion_level = 1;
        state.champion_awake = true;
        state.add_ally(Card::ClumsyApprentice, false, false);

        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::UndeniableTruth,
                    ..
                }
            )),
            "Truth→Blade should remain legal: {legal:?}"
        );
    }

    #[test]
    fn draw_potential_counts_recollect_windows_and_hand_engines() {
        // Mate on turn 0 of 3 → 3 recollect draws still owed.
        let mut state = State::with_queue(
            &[
                Card::IncreasingDanger,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
            true,
            3,
            &[
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
        );
        state.phase = Phase::Materialize;
        state.turn = 0;
        assert_eq!(state.recollect_draw_potential(), 3);
        // Increasing Danger is playable (4 cards in hand/memory) → +2.
        assert_eq!(state.draw_potential(), 5);

        // After leaving Mate on turn 0, only turns 1 and 2 remain.
        state.phase = Phase::Main;
        assert_eq!(state.recollect_draw_potential(), 2);
        assert_eq!(state.draw_potential(), 4);

        // Truth needs an ally; without one it should not count.
        state.hand[Card::IncreasingDanger.index()] = 0;
        state.hand[Card::UndeniableTruth.index()] = 1;
        state.hand_len = 4;
        assert_eq!(state.draw_potential(), 2); // recollects only
        state.add_ally(Card::ClumsyApprentice, true, false);
        assert_eq!(state.draw_potential(), 3); // + Truth
    }

    #[test]
    fn draw_potential_counts_ring_and_memory_engines() {
        let mut state = State::with_queue(
            &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
            true,
            3,
            &[],
        );
        state.phase = Phase::Materialize;
        state.turn = 0;
        state.materials = 0;
        // 3 Mate windows, no ring → recollects only.
        assert_eq!(state.recollect_draw_potential(), 3);
        assert_eq!(state.draw_potential(), 3);

        // Ring still in the material deck: +1 draw per future Mate step.
        state.materials = MAT_RING;
        assert_eq!(state.draw_potential(), 6); // 3 recollect + 3 ring

        // After materialize+banish, ring is gone from materials and not on field.
        state.materials = 0;
        state.ring = false;
        state.phase = Phase::Main;
        assert_eq!(state.recollect_draw_potential(), 2);
        assert_eq!(state.draw_potential(), 2);

        state.memory[Card::ClumsyApprentice.index()] = 1;
        state.memory_len = 1;
        assert_eq!(state.draw_potential(), 3); // 2 recollect + Clumsy
    }

    #[test]
    fn glimpse_tail_orders_cover_top_and_bottom() {
        // Two distinct peeked cards + a middle card → five layouts (not six):
        // both-top ×2, split ×2, both-bottom ×1.
        let state = State::with_queue(
            &[],
            false,
            1,
            &[Card::Brick, Card::IgnitedStab, Card::Arthur],
        );
        assert_eq!(state.glimpse_layout_count(), 5);
        let mut reordered = state;
        reordered.apply_glimpse_layout(1);
        assert_eq!(
            reordered.queue[reordered.queue_pos as usize],
            Card::IgnitedStab as u8
        );
        // Both-bottom layout (index 4) keeps original relative order.
        let mut both_bottom = state;
        both_bottom.apply_glimpse_layout(4);
        let pos = both_bottom.queue_pos as usize;
        assert_eq!(both_bottom.queue[pos], Card::Arthur as u8);
        assert_eq!(both_bottom.queue[pos + 1], Card::Brick as u8);
        assert_eq!(both_bottom.queue[pos + 2], Card::IgnitedStab as u8);
    }

    #[test]
    fn glimpse_collapses_to_unique_tops_when_one_draw_remains() {
        // Mate on the last turn: only the recollect draw remains (potential 1).
        // A-top layouts (both-stay / A-top-B-bottom) collapse; same for B-top.
        // Both-bottom keeps a third top when middle is non-empty.
        let mut state = State::with_queue(
            &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
            true,
            3,
            &[Card::Brick, Card::IgnitedStab, Card::Arthur],
        );
        state.phase = Phase::Materialize;
        state.turn = 2;
        state.materials = 0;
        assert_eq!(state.draw_potential(), 1);
        assert_eq!(state.glimpse_layout_count(), 5);
        let relevant = state.glimpse_relevant_layouts();
        assert_eq!(relevant, vec![0, 1, 4], "{relevant:?}");

        // Empty middle: only two tops (A vs B); both-bottom duplicates both-stay.
        let mut tight = State::with_queue(
            &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
            true,
            3,
            &[Card::Brick, Card::IgnitedStab],
        );
        tight.phase = Phase::Materialize;
        tight.turn = 2;
        tight.materials = 0;
        assert_eq!(tight.draw_potential(), 1);
        assert_eq!(tight.glimpse_relevant_layouts(), vec![0, 1]);
    }

    #[test]
    fn glimpse_skipped_when_draw_potential_is_zero() {
        let mut state = State::with_queue(
            &[Card::Brick; 4],
            true,
            3,
            &[Card::Brick, Card::IgnitedStab],
        );
        state.phase = Phase::Main;
        state.turn = 2; // last turn, Mate already done → no recollect draws left
        state.materials = 0;
        assert_eq!(state.draw_potential(), 0);
        assert!(state.glimpse_relevant_layouts().is_empty());
    }

    #[test]
    fn mate_ending_siblings_collapse_identical_post_mate_keys() {
        // All-brick queue: every Glimpse permutation is the same memo board after Mate.
        let mut state = State::with_queue_and_materials(
            &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
            false,
            2,
            &[Card::Brick, Card::Brick, Card::Brick],
            MAT_ZANDER,
        );
        state.phase = Phase::Materialize;
        state.turn = 1;
        state.memory[Card::Brick.index()] = 1;
        state.memory_len = 1;

        let layout_count = state.glimpse_layout_count();
        assert!(
            layout_count >= 2,
            "need multiple Glimpse layouts to collapse"
        );
        let endings: Vec<Action> = (0..layout_count)
            .map(|layout| Action::MaterializeZanderMemory {
                glimpse_layout: Some(layout),
            })
            .chain(std::iter::once(Action::SkipMaterialize))
            .collect();

        let collapsed = collapse_mate_ending_siblings(state, endings);
        let zander = collapsed
            .iter()
            .filter(|action| matches!(action, Action::MaterializeZanderMemory { .. }))
            .count();
        assert_eq!(
            zander, 1,
            "identical brick permutations must share one post-Mate key: {collapsed:?}"
        );
        assert!(
            collapsed
                .iter()
                .any(|action| matches!(action, Action::SkipMaterialize)),
            "Skip differs (no Zander level): {collapsed:?}"
        );
    }

    #[test]
    fn mate_ending_siblings_keep_distinct_post_mate_keys() {
        let mut state = State::with_queue_and_materials(
            &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
            false,
            2,
            &[Card::Brick, Card::IgnitedStab, Card::Arthur],
            MAT_ZANDER | MAT_HAMMER,
        );
        state.phase = Phase::Materialize;
        state.turn = 1;
        state.memory[Card::Brick.index()] = 1;
        state.memory_len = 1;

        let legal = solver_actions(state, true);
        let zander = legal
            .iter()
            .filter(|action| matches!(action, Action::MaterializeZanderMemory { .. }))
            .count();
        assert!(
            zander >= 2,
            "distinct tops must remain separate Mate endings: {legal:?}"
        );
        assert!(
            legal
                .iter()
                .any(|action| matches!(action, Action::MaterializeHammer)),
            "{legal:?}"
        );
        assert!(
            legal
                .iter()
                .any(|action| matches!(action, Action::SkipMaterialize)),
            "{legal:?}"
        );
    }

    #[test]
    fn mate_collapse_does_not_drop_fast_plays() {
        let mut state = State::with_queue_and_materials(
            &[Card::Demolition, Card::Brick, Card::Brick, Card::Brick],
            false,
            2,
            &[Card::Brick, Card::Brick],
            0,
        );
        state.phase = Phase::Materialize;
        state.turn = 1;

        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::Demolition,
                    ..
                }
            )),
            "fast Demolition must stay outside Mate-ending collapse: {legal:?}"
        );
        assert!(
            legal
                .iter()
                .any(|action| matches!(action, Action::SkipMaterialize)),
            "{legal:?}"
        );
    }

    #[test]
    fn reservation_budget_scales_influence_by_mains_left() {
        let mut state = State::with_queue(&[Card::Brick; 7], true, 3, &[]);
        state.phase = Phase::Main;
        state.turn = 0;
        assert_eq!(state.influence(), 7);
        assert_eq!(reservation_budget(state), 21); // 7 × 3
        assert_eq!(optimistic_remaining_from_reserve(21), 52); // 21 × 2.5
        assert_eq!(optimistic_remaining_from_reserve(5), 12);
        assert_eq!(optimistic_remaining_from_reserve(4), 10);
    }

    #[test]
    fn damage_first_orders_burn_before_draw_engines() {
        // Extra brick so ID payment leaves Smoke Out still affordable (soft dig gate).
        let mut state = State::with_queue_and_materials(
            &[
                Card::SmokeOut,
                Card::IncreasingDanger,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
            false,
            2,
            &[],
            0,
        );
        state.phase = Phase::Main;
        state.champion_level = 1;

        let mut legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::SmokeOut,
                    ..
                }
            )),
            "{legal:?}"
        );
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::IncreasingDanger,
                    ..
                }
            )),
            "{legal:?}"
        );

        order_actions_damage_first(&state, &mut legal);
        let smoke = legal.iter().position(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::SmokeOut,
                    ..
                }
            )
        });
        let dig = legal.iter().position(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::IncreasingDanger,
                    ..
                }
            )
        });
        assert!(
            smoke.unwrap() < dig.unwrap(),
            "Smoke Out should expand before Increasing Danger: {legal:?}"
        );
    }

    #[test]
    fn materialize_zander_with_glimpse_reorders_queue() {
        let mut state = State::with_queue(
            &[
                Card::Arthur,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
            true,
            3,
            &[Card::Brick, Card::IgnitedStab],
        );
        state.turn = 1;
        state.phase = Phase::Materialize;
        state.memory[Card::Brick.index()] = 1;
        state.memory_len = 1;

        let (after, steps) = apply(
            state,
            Action::MaterializeZanderMemory {
                glimpse_layout: Some(1),
            },
        );
        assert!(
            steps.iter().any(|step| step.kind.as_str() == "glimpse"),
            "{steps:?}"
        );
        assert!(
            steps
                .iter()
                .any(|step| step.kind.as_str() == "recollect" && step.drawn == Some("ignited_stab")),
            "{steps:?}"
        );
        assert_eq!(after.champion_level, 1);
    }

    #[test]
    fn zander_prefers_banishing_floating_memory_from_gy() {
        let mut state = State::with_queue(&[], false, 3, &[Card::Brick]);
        state.champion_level = 0;
        state.phase = Phase::Materialize;
        state.turn = 1;
        state.send_to_gy(Card::KingdomInformant);

        let (after, steps) = apply(
            state,
            Action::MaterializeZanderMemory {
                glimpse_layout: None,
            },
        );
        assert_eq!(after.float_gy, 0);
        assert_eq!(after.gy_total, 0);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Float from GY")),
            "{steps:?}"
        );
    }

    #[test]
    fn equal_damage_prefers_higher_end_influence() {
        // Playing Hot Cake deals no damage but spends cards to memory; Pass keeps them
        // in hand. Same damage (0), so the line with more hand+memory at the end wins.
        let hand = [Card::HotCake, Card::Brick, Card::Brick, Card::Brick];
        let result = solve_cards(&hand, true, 1, ALL_MATERIALS);
        assert_eq!(result.max_damage, 0, "{result:#?}");
        assert_eq!(result.end_influence, 4, "{result:#?}");
        assert!(
            !result
                .events
                .iter()
                .any(|step| format_line_event(step).contains("Hot Cake")),
            "should Pass instead of playing Hot Cake: {:?}",
            labels(&result.events)
        );
    }

    #[test]
    fn drill_three_meets_published_twenty() {
        let hand = [
            Card::RendingFlames,
            Card::Arthur,
            Card::HastyMessenger,
            Card::KingdomInformant,
            Card::IgnitedStab,
            Card::SableRemnant,
            Card::ClumsyApprentice,
        ];
        let result = solve_cards(&hand, true, 3, ALL_MATERIALS);
        assert!(result.max_damage >= 20, "{result:#?}");
        assert_eq!(result.effective.engine_version, ENGINE_VERSION);
        assert_eq!(result.effective.max_turns, Some(3));
        assert_eq!(result.effective.sim_type, Some(SimType::FireBrick));
    }

    #[test]
    fn going_second_draws_at_start_of_first_turn() {
        let hand = [
            Card::Arthur,
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::KingdomInformant,
            Card::RedHare,
            Card::PepperedChef,
        ];
        let (pass, stats) = solve_pass(&hand, false, 2, &[Card::IgnitedStab], false, ALL_MATERIALS)
            .expect("solve_pass");
        assert_eq!(
            pass.events.first().and_then(|event| event.drawn),
            Some("ignited_stab"),
            "{}",
            labels(&pass.events).join(" | ")
        );
        assert_eq!(stats.drawn[Card::IgnitedStab.index()], 1);
    }

    #[test]
    fn fire_brick_going_second_draws_brick_without_a_deck() {
        use crate::model::SolveRequest;
        use std::collections::BTreeMap;

        let hand = [
            Card::Arthur,
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::KingdomInformant,
            Card::RedHare,
            Card::PepperedChef,
        ];
        let result = solve(&SolveRequest {
            hand: hand.iter().map(|card| card.id().to_string()).collect(),
            go_first: false,
            max_turns: 2,
            sim_type: SimType::FireBrick,
            deck: BTreeMap::new(),
            queue: None,
            rollouts: 1,
            seed: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .unwrap();
        assert_eq!(
            result.events.first().and_then(|event| event.drawn),
            Some("brick"),
            "with no deck attached, the opening draw stays a Fire Brick: {}",
            labels(&result.events).join(" | ")
        );
    }

    #[test]
    fn fire_brick_going_second_draws_a_real_card_from_an_attached_deck() {
        use crate::model::SolveRequest;
        use std::collections::BTreeMap;

        let hand = [
            Card::Arthur,
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::KingdomInformant,
            Card::RedHare,
            Card::PepperedChef,
        ];
        let deck = BTreeMap::from([("ignited_stab".into(), 4_u8), ("brick".into(), 54_u8)]);
        let result = solve(&SolveRequest {
            hand: hand.iter().map(|card| card.id().to_string()).collect(),
            go_first: false,
            max_turns: 2,
            sim_type: SimType::FireBrick,
            deck: deck.clone(),
            queue: None,
            rollouts: 1,
            seed: 7,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .unwrap();
        let drawn = result.events.first().and_then(|event| event.drawn);
        assert!(
            drawn.is_some(),
            "expected a real opening draw: {}",
            labels(&result.events).join(" | ")
        );

        let again = solve(&SolveRequest {
            hand: hand.iter().map(|card| card.id().to_string()).collect(),
            go_first: false,
            max_turns: 2,
            sim_type: SimType::FireBrick,
            deck,
            queue: None,
            rollouts: 1,
            seed: 7,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .unwrap();
        assert_eq!(
            drawn,
            again.events.first().and_then(|event| event.drawn),
            "same seed and deck must draw the same opening card"
        );
    }

    #[test]
    fn fire_brick_going_second_prefers_an_explicit_remaining_queue() {
        use crate::model::SolveRequest;
        use std::collections::BTreeMap;

        let hand = [
            Card::Arthur,
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::KingdomInformant,
            Card::RedHare,
            Card::PepperedChef,
        ];
        let result = solve(&SolveRequest {
            hand: hand.iter().map(|card| card.id().to_string()).collect(),
            go_first: false,
            max_turns: 2,
            sim_type: SimType::FireBrick,
            deck: BTreeMap::new(),
            queue: Some(vec!["ignited_stab".into(), "brick".into()]),
            rollouts: 1,
            seed: 42,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .unwrap();
        assert_eq!(
            result.events.first().and_then(|event| event.drawn),
            Some("ignited_stab"),
            "an explicit remaining-deck order should be used as-is: {}",
            labels(&result.events).join(" | ")
        );
    }

    #[test]
    fn drill_one_is_twenty_six() {
        let hand = [
            Card::BlazingThrow,
            Card::Arthur,
            Card::RedHare,
            Card::Arthur,
            Card::BlazingThrow,
            Card::KingdomInformant,
            Card::KingdomInformant,
        ];
        let result = solve_cards(&hand, true, 3, ALL_MATERIALS);
        assert_eq!(result.max_damage, 24, "{result:#?}");
        assert_eq!(result.effective.go_first, Some(true));
    }

    #[test]
    fn new_deck_cards_are_recognized() {
        for name in [
            "sadi_blood_harvester",
            "corhazi_courier",
            "dazzling_courtesan",
            "march_hare_mottled_host",
            "rococo_explosive_maven",
            "vermilion_decree",
            "xiao_qiao_cinderkeeper",
            "planted_explosive",
            "intensified_pyre",
            "hot_cake",
            "uncanny_realization",
            "virgil_altered_future",
            "vicious_slice",
            "manic_zealot",
            "demolition",
            "surging_bolt",
            "woodland_squirrels",
            "duchess_six_of_hearts",
            "wandering_glaivier",
            "flagrant_guide",
        ] {
            assert!(parse_card(name).is_some(), "{name}");
        }
    }

    #[test]
    fn arthur_buff_attributed_to_arthur() {
        let hand = [
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ];
        let result = solve_cards(&hand, false, 2, ALL_MATERIALS);
        let arthur = result
            .card_stats
            .iter()
            .find(|stat| stat.card == "arthur")
            .expect("arthur stat row");
        assert!(
            arthur.attacks >= 1,
            "Arthur should attack at least once, got {}",
            arthur.attacks
        );
        assert!(
            arthur.damage >= 3,
            "Arthur should get own attack plus rested buff, got {}",
            arthur.damage
        );
        let clumsy = result
            .card_stats
            .iter()
            .find(|stat| stat.card == "clumsy_apprentice")
            .expect("clumsy stat row");
        if clumsy.attacks > 0 {
            assert_eq!(
                clumsy.damage, clumsy.attacks,
                "buffed ally should only get base attack power per attack"
            );
        }
    }

    #[test]
    fn poisoned_dagger_must_activate_before_other_main_actions() {
        let mut state = State::with_queue(&[Card::IgnitedStab], false, 2, &[]);
        state.dagger = true;
        state.dagger_ready = true;
        state.champion_level = 1;
        state.champion_awake = true;

        let legal = solver_actions(state, false);
        assert_eq!(legal.len(), 1, "{legal:?}");
        assert!(matches!(legal[0], Action::ActivateDagger), "{legal:?}");

        let (after, _) = apply(state, Action::ActivateDagger);
        let legal_after = solver_actions(after, false);
        assert!(
            !legal_after
                .iter()
                .any(|action| matches!(action, Action::ActivateDagger)),
            "{legal_after:?}"
        );
        assert!(
            legal_after
                .iter()
                .any(|action| matches!(action, Action::PlayAttack { .. } | Action::Pass)),
            "{legal_after:?}"
        );
    }

    #[test]
    fn other_allies_cannot_attack_while_arthur_is_ready() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.add_ally(Card::Arthur, true, true);
        state.add_ally(Card::ClumsyApprentice, true, false);

        let legal = solver_actions(state, false);
        assert!(
            legal
                .iter()
                .any(|action| matches!(action, Action::AttackArthur(_))),
            "{legal:?}"
        );
        assert!(
            !legal
                .iter()
                .any(|action| matches!(action, Action::AttackOthers)),
            "AttackOthers must wait until Arthur has attacked: {legal:?}"
        );

        let (after_arthur, _) = apply(state, Action::AttackArthur(0));
        let legal_after = solver_actions(after_arthur, false);
        assert!(
            legal_after
                .iter()
                .any(|action| matches!(action, Action::AttackOthers)),
            "{legal_after:?}"
        );
    }

    #[test]
    fn vicious_slice_deals_three_vs_human_while_assassin() {
        let mut state = State::with_queue(&[Card::ViciousSlice, Card::Brick], false, 1, &[]);
        state.champion_level = 1;
        state.champion_awake = true;
        let legal = solver_actions(state, false);
        let attack = legal
            .iter()
            .copied()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAttack {
                        card: Card::ViciousSlice,
                        ..
                    }
                )
            })
            .expect("vicious slice play");
        let (after, steps) = apply(state, attack);
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Vicious Slice (Human)")),
            "{steps:?}"
        );
    }

    #[test]
    fn champion_can_attack_with_weapon_without_attack_card() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.champion_level = 1;
        state.champion_awake = true;
        state.prep = 1;
        state.materials = MAT_BLADE;

        assert!(
            solver_actions(state, false)
                .iter()
                .any(|action| matches!(action, Action::MercenaryBlade)),
            "blade should be materializable"
        );
        let (equipped, _) = apply(state, Action::MercenaryBlade);
        assert!(equipped.has_weapon(Weapon::MercenaryBlade));
        assert!(
            equipped.champion_awake,
            "materializing the blade must not rest the champion"
        );
        assert!(
            solver_actions(equipped, false)
                .iter()
                .any(|action| matches!(action, Action::AttackWithWeapon(_))),
            "awake champion with weapon must be able to swing"
        );

        let (after, steps) = apply(equipped, Action::AttackWithWeapon(Weapon::MercenaryBlade));
        assert_eq!(after.damage, 1, "{steps:?}");
        assert!(!after.champion_awake);
        assert!(!after.has_weapon(Weapon::MercenaryBlade));
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Attack with Mercenary's Blade"),
            "{steps:?}"
        );
    }

    #[test]
    fn impact_hammer_self_damage_enables_heated_vengeance() {
        let mut state = State::with_queue(
            &[Card::HeatedVengeance, Card::Brick, Card::Brick, Card::Brick],
            false,
            1,
            &[],
        );
        state.champion_level = 1;
        state.equip_weapon(Weapon::ImpactHammer);

        let (after_swing, steps) = apply(state, Action::AttackWithWeapon(Weapon::ImpactHammer));
        assert!(after_swing.champion_damaged);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Impact Hammer self 3"),
            "{steps:?}"
        );
        assert_eq!(after_swing.damage, 2, "{steps:?}");

        // Wake for a second attack with Heated Vengeance (same turn damaged flag).
        let mut ready = after_swing;
        ready.champion_awake = true;
        let (after_hv, hv_steps) = apply(
            ready,
            Action::PlayAttack {
                card: Card::HeatedVengeance,
                wield: None,
                prepared: false,
                doubled: false,
                command_ally: None,
            },
        );
        assert_eq!(after_hv.damage, 2 + 5, "{hv_steps:?}");
        assert!(
            hv_steps
                .iter()
                .any(|step| format_line_event(step) == "Heated Vengeance (+3)"),
            "{hv_steps:?}"
        );
    }

    #[test]
    fn ally_attacks_do_not_rest_champion_for_later_weapon_swing() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.champion_level = 1;
        state.champion_awake = true;
        state.equip_weapon(Weapon::MercenaryBlade);
        state.add_ally(Card::Arthur, true, true);

        let (after_arthur, _) = apply(state, Action::AttackArthur(0));
        assert!(
            after_arthur.champion_awake,
            "ally attack must leave champion awake"
        );
        assert!(
            solver_actions(after_arthur, false)
                .iter()
                .any(|action| matches!(action, Action::AttackWithWeapon(_))),
            "{:?}",
            solver_actions(after_arthur, false)
        );
    }

    #[test]
    fn demolition_fast_deals_three_during_materialize() {
        let mut state = State::with_queue(
            &[
                Card::Demolition,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
            false,
            1,
            &[],
        );
        state.phase = Phase::Materialize;
        state.turn = 1;

        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::Demolition,
                    ..
                }
            )),
            "Demolition should be Fast-playable during materialize: {legal:?}"
        );

        let play = legal
            .iter()
            .copied()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::Demolition,
                        ..
                    }
                )
            })
            .expect("demolition play");
        let (after, steps) = apply(state, play);
        assert_eq!(after.phase, Phase::Materialize);
        assert_eq!(after.damage, 3);
        assert!(!after.has(Card::Demolition));
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Fast Activate Demolition")),
            "{steps:?}"
        );
    }

    #[test]
    fn virgil_fast_activates_before_recollect_and_commands_uncanny() {
        let mut state = State::with_queue(
            &[
                Card::Virgil,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::UncannyRealization,
                Card::Brick,
            ],
            false,
            2,
            &[],
        );
        state.phase = Phase::Materialize;
        state.turn = 1;

        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAlly {
                    card: Card::Virgil,
                    ..
                }
            )),
            "Virgil should be Fast-playable during materialize: {legal:?}"
        );

        let play = legal
            .iter()
            .copied()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::Virgil,
                        ..
                    }
                )
            })
            .expect("virgil play");
        let (after_play, steps) = apply(state, play);
        assert_eq!(after_play.phase, Phase::Materialize);
        assert_eq!(after_play.ally_len, 1);
        assert_eq!(after_play.allies[0].card(), Card::Virgil);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Fast Activate")),
            "{steps:?}"
        );

        let (after_skip, _) = apply(after_play, Action::SkipMaterialize);
        assert_eq!(after_skip.phase, Phase::Main);
        let legal_main = solver_actions(after_skip, false);
        assert!(
            legal_main.iter().any(|action| matches!(
                action,
                Action::PlayAttack {
                    card: Card::UncannyRealization,
                    command_ally: Some(0),
                    ..
                }
            )),
            "Virgil should enable Uncanny Realization: {legal_main:?}"
        );
    }

    #[test]
    fn tristan_materialize_matches_zander_prep_flow() {
        let mut state = State::with_queue_and_materials(
            &[Card::IgnitedStab, Card::KingdomInformant],
            false,
            2,
            &[Card::Brick],
            MAT_TRISTAN,
        );
        state.phase = Phase::Materialize;
        state.turn = 1;
        state.hand[Card::KingdomInformant.index()] = 0;
        state.hand_len = state.hand_len.saturating_sub(1);
        state.memory[Card::KingdomInformant.index()] = 1;
        state.memory_len = 1;

        let (after, steps) = apply(state, Action::MaterializeTristanMemory);
        assert!(after.tristan_leveled);
        assert_eq!(after.prep, 1);
        assert_eq!(after.champion_level, 1);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Tristan Lvl 1 Prep")),
            "{steps:?}"
        );
        assert!(
            steps.iter().all(|step| step.kind.as_str() != "glimpse"),
            "Tristan must not Glimpse: {steps:?}"
        );
        let legal = solver_actions(state, true);
        let tristan_plays = legal
            .iter()
            .filter(|action| matches!(action, Action::MaterializeTristanMemory))
            .count();
        assert_eq!(
            tristan_plays, 1,
            "Tristan must not fan out Glimpse layouts: {legal:?}"
        );
    }

    #[test]
    fn tristan_agility_recollect_and_fast_demolition() {
        let mut state = State::with_queue(
            &[Card::Demolition, Card::Brick, Card::Brick, Card::Brick],
            false,
            2,
            &[],
        );
        state.tristan_leveled = true;
        state.agility = 3;

        let (after_pass, _) = apply(state, Action::Pass);
        assert_eq!(after_pass.phase, Phase::Agility);

        let legal = solver_actions(after_pass, false);
        assert!(
            !legal
                .iter()
                .any(|action| matches!(action, Action::TristanRecollect)),
            "recollect needs 3 memory cards: {legal:?}"
        );
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::Demolition,
                    ..
                }
            )),
            "Demolition should be fast-playable during agility: {legal:?}"
        );

        let (after_demolition, demo_steps) = apply(
            after_pass,
            Action::PlayAction {
                card: Card::Demolition,
                kindle: 0,
                prepared: false,
                imbue: false,
                sacrifice_ally: None,
            },
        );
        assert_eq!(after_demolition.damage, 3);
        assert_eq!(after_demolition.phase, Phase::Agility);
        assert_eq!(after_demolition.memory_len, 3);
        assert!(
            demo_steps
                .iter()
                .any(|step| format_line_event(step).contains("Fast Activate Demolition")),
            "{demo_steps:?}"
        );

        let (after_recollect, recollect_steps) = apply(after_demolition, Action::TristanRecollect);
        assert_eq!(after_recollect.agility, 0);
        assert_eq!(after_recollect.memory_len, 0);
        assert_eq!(after_recollect.hand[Card::Brick.index()], 3);
        assert!(
            recollect_steps
                .iter()
                .any(|step| format_line_event(step).contains("Tristan Recollect (Agility 3)")),
            "{recollect_steps:?}"
        );

        let (after_end, _) = apply(after_recollect, Action::SkipAgility);
        assert_eq!(after_end.phase, Phase::Materialize);
    }

    #[test]
    fn tristan_agility_allows_fast_cards_only() {
        let mut state = State::with_queue(
            &[
                Card::Virgil,
                Card::FieryInterference,
                Card::Demolition,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
            false,
            2,
            &[],
        );
        state.tristan_leveled = true;

        let (after_pass, _) = apply(state, Action::Pass);
        assert_eq!(after_pass.phase, Phase::Agility);

        let legal = solver_actions(after_pass, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAlly {
                    card: Card::Virgil,
                    ..
                }
            )),
            "Virgil should be fast-playable during agility: {legal:?}"
        );
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::Demolition,
                    ..
                }
            )),
            "Demolition should be fast-playable during agility: {legal:?}"
        );
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::FieryInterference,
                    ..
                }
            )),
            "slow actions should not be playable during agility: {legal:?}"
        );
    }

    #[test]
    fn materialize_still_limits_fast_activations_to_fast_cards() {
        let mut state = State::with_queue(
            &[Card::FieryInterference, Card::Brick, Card::Brick],
            false,
            1,
            &[],
        );
        state.phase = Phase::Materialize;
        state.turn = 1;

        let legal = solver_actions(state, false);
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::FieryInterference,
                    ..
                }
            )),
            "slow actions should not fast-activate during materialize: {legal:?}"
        );
    }

    #[test]
    fn playing_unique_ally_kills_existing_copy() {
        let mut state = State::with_queue(&[Card::Rococo, Card::Brick], false, 1, &[]);
        state.add_ally(Card::Rococo, true, false);
        state.add_ally(Card::ClumsyApprentice, true, false);
        let legal = solver_actions(state, false);
        let play = legal
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::Rococo,
                        ..
                    }
                )
            })
            .expect("second Rococo should be playable over the board copy");
        let (after, steps) = apply(state, play);
        assert_eq!(after.ally_len, 2, "{steps:?}");
        assert_eq!(after.allies[0].card(), Card::ClumsyApprentice);
        assert_eq!(after.allies[1].card(), Card::Rococo);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Unique: Rococo, Explosive Maven dies"),
            "{steps:?}"
        );
        assert!(after.fire_gy >= 1, "killed Rococo should go to GY");
    }

    #[test]
    fn uncanny_realization_requires_automaton_and_buffs_unique() {
        let mut no_auto =
            State::with_queue(&[Card::UncannyRealization, Card::Brick], false, 1, &[]);
        no_auto.add_ally(Card::ClumsyApprentice, true, false);
        let legal = solver_actions(no_auto, false);
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAttack {
                    card: Card::UncannyRealization,
                    ..
                }
            )),
            "non-Automaton allies cannot Command Uncanny Realization: {legal:?}"
        );

        let mut with_rococo =
            State::with_queue(&[Card::UncannyRealization, Card::Brick], false, 1, &[]);
        with_rococo.add_ally(Card::Rococo, true, false);
        let legal = solver_actions(with_rococo, false);
        let command = legal
            .iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAttack {
                        card: Card::UncannyRealization,
                        command_ally: Some(0),
                        ..
                    }
                )
            })
            .copied()
            .expect("Rococo should enable Uncanny Realization");
        let (after, steps) = apply(with_rococo, command);
        assert_eq!(
            after.damage, 6,
            "3 Uncanny +1 Rococo attack +2 unique: {steps:?}"
        );
        assert!(!after.allies[0].awake());
        assert!(
            after.champion_awake,
            "Command Automaton should not rest champion"
        );
    }

    #[test]
    fn tweedledum_stealth_only_after_zander_levels() {
        // Later turn, still unleveled: Assassin class bonus is off, so cull kills Tweedledum.
        let mut unleveled = State::with_queue(&[], false, 3, &[]);
        unleveled.turn = 2;
        unleveled.champion_level = 0;
        unleveled.add_ally(Card::Tweedledum, true, false);
        unleveled.add_ally(Card::KingdomInformant, true, false);
        unleveled.enemy_cull(None);
        assert_eq!(unleveled.ally_len, 1);
        assert_eq!(unleveled.allies[0].card(), Card::KingdomInformant);

        // Same later turn after leveling: class stealth applies, Tweedledum survives.
        let mut leveled = State::with_queue(&[], false, 3, &[]);
        leveled.turn = 2;
        leveled.champion_level = 1;
        leveled.add_ally(Card::Tweedledum, true, false);
        leveled.add_ally(Card::ClumsyApprentice, true, false);
        leveled.enemy_cull(None);
        assert_eq!(leveled.ally_len, 1);
        assert_eq!(leveled.allies[0].card(), Card::Tweedledum);
    }

    #[test]
    fn package_courier_on_enter_discards_then_draws() {
        let mut state = State::with_queue(
            &[
                Card::PackageCourier,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::IgnitedStab,
            ],
            true,
            1,
            &[],
        );
        state.turn = 1;
        let play = solver_actions(state, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::PackageCourier,
                        ..
                    }
                )
            })
            .expect("play Package Courier");
        let (after, steps) = apply(state, play);
        assert_eq!(after.ally_len, 1);
        assert_eq!(after.allies[0].card(), Card::PackageCourier);
        assert!(
            steps.iter().any(|event| {
                event.kind == EventKind::OnEnterDraw
                    && event.discarded.is_some()
                    && event.drawn.is_some()
            }),
            "expected On-Enter discard/draw: {steps:?}"
        );
        // Courier + 2 reserve + 1 discard = 4 cards from hand; draw puts one back.
        assert_eq!(after.hand_len, 2);
    }

    #[test]
    fn corhazi_courier_on_hit_discards_then_draws() {
        let mut state = State::with_queue(
            &[Card::Brick],
            true,
            1,
            &[Card::KingdomInformant],
        );
        state.champion_level = 1;
        state.champion_awake = true;
        state.turn = 1;
        state.add_ally(Card::CorhaziCourier, true, false);

        let (after, steps) = apply(state, Action::AttackOthers);
        assert!(after.has(Card::KingdomInformant), "{steps:?}");
        assert!(!after.has(Card::Brick), "{steps:?}");
        assert!(
            steps.iter().any(|event| {
                event.kind == EventKind::CorhaziOnHit
                    && event.discarded == Some("brick")
                    && event.drawn == Some("kingdom_informant")
            }),
            "expected On-Hit discard/draw: {steps:?}"
        );
        assert!(
            steps.iter().any(|step| {
                format_line_event(step) == "Corhazi On-Hit draw Kingd / discard Brick"
            }),
            "{steps:?}"
        );
    }

    #[test]
    fn flagrant_guide_on_enter_levels_zander_and_marks_champion_damaged() {
        let mut state = State::with_queue(
            &[Card::FlagrantGuide, Card::Brick, Card::Brick, Card::Brick],
            true,
            1,
            &[],
        );
        state.champion_awake = true;
        state.turn = 1;
        let play = solver_actions(state, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::FlagrantGuide,
                        flagrant_level: Some(MAT_ZANDER),
                        ..
                    }
                )
            })
            .expect("Flagrant Guide should offer Zander level");
        let (after, steps) = apply(state, play);
        assert_eq!(after.champion_level, 1, "{steps:?}");
        assert!(after.champion_damaged, "{steps:?}");
        assert_eq!(after.prep, 1, "{steps:?}");
        assert_eq!(after.memory_len, 3, "{steps:?}");
        assert!(
            !steps
                .iter()
                .any(|step| step.kind.as_str() == "floatForZander"),
            "Flagrant Guide level should not pay memory: {steps:?}"
        );
        assert!(
            steps.iter().any(|step| {
                format_line_event(step) == "Flagrant Guide On-Enter level (self 6)"
            }),
            "{steps:?}"
        );
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Zander Lvl 1 Glimpse/Prep"),
            "{steps:?}"
        );
    }

    #[test]
    fn flagrant_guide_level_enables_heated_vengeance() {
        let mut state = State::with_queue(
            &[
                Card::FlagrantGuide,
                Card::HeatedVengeance,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
            true,
            1,
            &[],
        );
        state.champion_awake = true;
        state.turn = 1;
        let flagrant = solver_actions(state, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::FlagrantGuide,
                        flagrant_level: Some(MAT_ZANDER),
                        ..
                    }
                )
            })
            .expect("Flagrant Guide level");
        let (state, _) = apply(state, flagrant);
        let mut state = state;
        state.add_hand(Card::Brick);
        state.add_hand(Card::Brick);
        state.add_hand(Card::Brick);
        let heated = solver_actions(state, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAttack {
                        card: Card::HeatedVengeance,
                        ..
                    }
                )
            })
            .expect("Heated Vengeance should be playable");
        let (after, steps) = apply(state, heated);
        assert_eq!(after.damage, 5, "{steps:?}");
    }

    #[test]
    fn zander_level2_only_via_flagrant_guide() {
        let mut state = State::with_queue(
            &[Card::FlagrantGuide, Card::Brick, Card::Brick, Card::Brick],
            false,
            2,
            &[],
        );
        state.phase = Phase::Main;
        state.turn = 1;
        state.champion_level = 1;
        state.champion_awake = true;
        state.materials |= MAT_ZANDER_2;

        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::FlagrantGuide,
                        flagrant_level: Some(MAT_ZANDER_2),
                        ..
                    }
                )
            }),
            "Deft Executor should only be reachable through Flagrant Guide: {legal:?}"
        );

        let unleveled = {
            let mut s = state;
            s.champion_level = 0;
            s
        };
        assert!(!solver_actions(unleveled, false).iter().any(|action| {
            matches!(
                action,
                Action::PlayAlly {
                    flagrant_level: Some(MAT_ZANDER_2),
                    ..
                }
            )
        }));
    }

    #[test]
    fn flagrant_guide_levels_zander2_with_prep_and_gy_return() {
        let mut state = State::with_queue(
            &[Card::FlagrantGuide, Card::Brick, Card::Brick, Card::Brick],
            false,
            2,
            &[],
        );
        state.phase = Phase::Main;
        state.turn = 1;
        state.champion_level = 1;
        state.prep = 1;
        state.champion_awake = true;
        state.materials |= MAT_ZANDER_2;
        state.send_to_gy(Card::IgnitedStab);

        let (after, steps) = apply(
            state,
            Action::PlayAlly {
                card: Card::FlagrantGuide,
                kindle: 0,
                sacrifice_ally: None,
                hot_cake_sacrifice: false,
                flagrant_level: Some(MAT_ZANDER_2),
                flagrant_gy_return: Some(Card::IgnitedStab),
            },
        );
        assert_eq!(after.champion_level, 2, "{steps:?}");
        assert_eq!(after.prep, 2, "{steps:?}");
        assert!(after.has(Card::IgnitedStab), "{steps:?}");
        assert_eq!(after.gy_count(Card::IgnitedStab), 0, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| { format_line_event(step) == "Zander, Deft Executor (+2 prep)" }),
            "{steps:?}"
        );
        assert!(
            steps.iter().any(|step| {
                format_line_event(step) == "Zander return Ignit from GY (−1 prep)"
            }),
            "{steps:?}"
        );
        assert!(
            steps.iter().any(|step| {
                format_line_event(step) == "Flagrant Guide On-Enter level (self 10)"
            }),
            "{steps:?}"
        );
    }

    #[test]
    fn materialize_ripper_pays_memory_and_equips() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.phase = Phase::Materialize;
        state.turn = 2;
        state.champion_level = 1;
        state.materials = MAT_RIPPER;
        state.memory[Card::KingdomInformant.index()] = 1;
        state.memory_len = 1;

        let (after, steps) = apply(state, Action::MaterializeRipper);
        assert_eq!(after.weapon_durability(Weapon::AssassinsRipper), 2);
        assert_eq!(after.memory_len, 0);
        assert_eq!(after.phase, Phase::Main);
        assert!(
            steps
                .iter()
                .any(|step| { format_line_event(step) == "Materialize Assassin's Ripper" }),
            "{steps:?}"
        );
    }

    #[test]
    fn activate_ripper_spends_prep_and_buffs_weapon() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.champion_level = 1;
        state.champion_awake = true;
        state.prep = 1;
        state.equip_weapon(Weapon::AssassinsRipper);

        let (after, steps) = apply(state, Action::ActivateRipper);
        assert_eq!(after.prep, 0);
        assert_eq!(after.weapon_power_bonus, 2);
        assert!(!after.champion_awake);
        assert!(
            steps.iter().any(|step| {
                format_line_event(step) == "Activate Assassin's Ripper (+2 power, REST)"
            }),
            "{steps:?}"
        );
    }

    #[test]
    fn ripper_power_bonus_applies_to_weapon_attacks() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.champion_level = 1;
        state.champion_awake = true;
        state.equip_weapon(Weapon::AssassinsRipper);
        state.weapon_power_bonus = 2;

        let (after, steps) = apply(state, Action::AttackWithWeapon(Weapon::AssassinsRipper));
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| { format_line_event(step) == "Attack with Assassin's Ripper" }),
            "{steps:?}"
        );
    }

    #[test]
    fn mercenary_blade_requires_champion_in_mate_only() {
        let mut unleveled_mate = State::with_queue(&[], false, 2, &[]);
        unleveled_mate.phase = Phase::Materialize;
        unleveled_mate.turn = 2;
        unleveled_mate.prep = 1;
        unleveled_mate.materials = MAT_BLADE;
        assert!(
            !solver_actions(unleveled_mate, false)
                .iter()
                .any(|action| matches!(action, Action::MercenaryBlade)),
            "mate blade requires leveled champion: {:?}",
            solver_actions(unleveled_mate, false)
        );

        let mut unleveled_main = unleveled_mate;
        unleveled_main.phase = Phase::Main;
        assert!(
            solver_actions(unleveled_main, false)
                .iter()
                .any(|action| matches!(action, Action::MercenaryBlade)),
            "main blade only needs prep: {:?}",
            solver_actions(unleveled_main, false)
        );

        let mut leveled_mate = unleveled_main;
        leveled_mate.champion_level = 1;
        leveled_mate.phase = Phase::Materialize;
        assert!(
            solver_actions(leveled_mate, false)
                .iter()
                .any(|action| matches!(action, Action::MercenaryBlade)),
            "mate blade legal once champion is leveled: {:?}",
            solver_actions(leveled_mate, false)
        );
    }

    #[test]
    fn multiple_weapons_coexist_on_field() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.phase = Phase::Materialize;
        state.turn = 1;
        state.materials = MAT_HAMMER | MAT_BLADE;
        state.champion_level = 1;
        state.prep = 1;

        let (after_hammer, _) = apply(state, Action::MaterializeHammer);
        assert!(after_hammer.has_weapon(Weapon::ImpactHammer));
        assert_eq!(after_hammer.weapon_durability(Weapon::ImpactHammer), 2);

        let mut after_blade = after_hammer;
        after_blade.phase = Phase::Materialize;
        after_blade.turn = 2;
        after_blade.prep = 1;
        let (after_blade, _) = apply(after_blade, Action::MercenaryBlade);
        assert!(
            after_blade.has_weapon(Weapon::ImpactHammer),
            "hammer should remain when blade is materialized"
        );
        assert!(after_blade.has_weapon(Weapon::MercenaryBlade));
        assert_eq!(after_blade.weapon_durability(Weapon::ImpactHammer), 2);
    }

    #[test]
    fn hammer_and_blade_materialize_on_turn_two() {
        let mut hammer_state = State::with_queue(&[], false, 2, &[]);
        hammer_state.phase = Phase::Materialize;
        hammer_state.turn = 2;
        hammer_state.materials = MAT_HAMMER;
        assert!(
            solver_actions(hammer_state, false)
                .iter()
                .any(|action| matches!(action, Action::MaterializeHammer)),
            "Impact Hammer should be materializable on turn 2: {:?}",
            solver_actions(hammer_state, false)
        );

        let mut blade_state = State::with_queue(&[], false, 2, &[]);
        blade_state.phase = Phase::Materialize;
        blade_state.turn = 2;
        blade_state.champion_level = 1;
        blade_state.prep = 1;
        blade_state.materials = MAT_BLADE;
        assert!(
            solver_actions(blade_state, false)
                .iter()
                .any(|action| matches!(action, Action::MercenaryBlade)),
            "Mercenary's Blade should be materializable on turn 2: {:?}",
            solver_actions(blade_state, false)
        );

        let (after_blade, steps) = apply(blade_state, Action::MercenaryBlade);
        assert_eq!(after_blade.phase, Phase::Main);
        assert!(after_blade.has_weapon(Weapon::MercenaryBlade));
        assert!(
            steps
                .iter()
                .any(|step| { format_line_event(step) == "Materialize Mercenary's Blade (prep)" }),
            "{steps:?}"
        );
    }

    #[test]
    fn crusader_ring_materializes_and_banishes_immediately() {
        let mut state = State::with_queue(&[], false, 2, &[Card::IgnitedStab, Card::Brick]);
        state.phase = Phase::Materialize;
        state.turn = 2;
        state.materials = MAT_RING;

        let legal_mate = solver_actions(state, false);
        assert!(
            legal_mate
                .iter()
                .any(|action| matches!(action, Action::MaterializeRing)),
            "ring should materialize from deck: {legal_mate:?}"
        );
        assert!(
            !legal_mate
                .iter()
                .any(|action| matches!(action, Action::BanishCrusaderRing)),
            "ring cannot be banished as a separate Mate action: {legal_mate:?}"
        );

        let hand_before = state.hand_len;
        let (after_mate, mate_steps) = apply(state, Action::MaterializeRing);
        assert!(!after_mate.ring, "ring must not linger on the field");
        assert!(!after_mate.has_material(MAT_RING));
        assert_eq!(after_mate.phase, Phase::Main);
        // Banish draw + recollect draw.
        assert!(
            after_mate.hand_len >= hand_before.saturating_add(2),
            "expected banish+recollect draws: before={hand_before} after={}",
            after_mate.hand_len
        );
        assert!(
            mate_steps
                .iter()
                .any(|step| format_line_event(step) == "Materialize Grand Crusader's Ring"),
            "{mate_steps:?}"
        );
        assert!(
            mate_steps
                .iter()
                .any(|step| { step.kind.as_str() == "banishCrusaderRing" && step.drawn.is_some() }),
            "banish+draw must happen in the same Mate resolution: {mate_steps:?}"
        );
        let legal_main = solver_actions(after_mate, false);
        assert!(
            !legal_main
                .iter()
                .any(|action| matches!(action, Action::BanishCrusaderRing)),
            "Main must not offer a delayed ring banish: {legal_main:?}"
        );
    }

    #[test]
    fn wandering_glaivier_on_death_draws_on_cull() {
        let mut state = State::with_queue(&[], false, 3, &[Card::IgnitedStab]);
        state.turn = 1;
        state.add_ally(Card::WanderingGlaivier, true, false);
        let mut tape = EventTape::new();
        state.enemy_cull(Some(&mut tape));
        let steps = tape.events;
        assert_eq!(state.ally_len, 0);
        assert!(state.has(Card::IgnitedStab), "{steps:?}");
        assert!(
            steps.iter().any(|step| {
                format_line_event(step) == "Wandering Glaivier On Death draw (Ignit)"
            }),
            "{steps:?}"
        );
    }

    #[test]
    fn manic_zealot_on_death_deals_two_on_cull() {
        let mut state = State::with_queue(&[], false, 3, &[]);
        state.turn = 1;
        state.add_ally(Card::ManicZealot, true, false);
        state.add_ally(Card::ClumsyApprentice, true, false);
        let mut tape = EventTape::new();
        state.enemy_cull(Some(&mut tape));
        let steps = tape.events;
        assert_eq!(state.ally_len, 0);
        assert_eq!(state.damage, 2);
        assert!(state.champion_damaged);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Manic Zealot On Death"),
            "{steps:?}"
        );
        assert!(Card::ManicZealot.is_automaton());
    }

    #[test]
    fn manic_zealot_on_death_from_peppered_chef_sacrifice() {
        let mut state = State::with_queue(
            &[Card::PepperedChef, Card::Brick, Card::Brick],
            false,
            1,
            &[],
        );
        state.champion_awake = true;
        state.champion_level = 1;
        state.add_ally(Card::ManicZealot, true, false);
        let play = solver_actions(state, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::PepperedChef,
                        sacrifice_ally: Some(0),
                        ..
                    }
                )
            })
            .expect("Peppered Chef should be able to sacrifice Manic Zealot");
        let (after, steps) = apply(state, play);
        assert_eq!(after.damage, 2, "{steps:?}");
        assert!(after.champion_damaged, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Manic Zealot On Death"),
            "{steps:?}"
        );
        assert_eq!(after.agility, 2);
    }

    #[test]
    fn peppered_chef_sacrifice_requires_non_arthur_ally() {
        let mut state = State::with_queue(
            &[Card::PepperedChef, Card::Brick, Card::Brick],
            false,
            1,
            &[],
        );
        state.champion_awake = true;
        state.add_ally(Card::Arthur, true, true);
        state.hot_cake = 1;

        let legal = solver_actions(state, false);
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAlly {
                    card: Card::PepperedChef,
                    sacrifice_ally: Some(_),
                    ..
                }
            )),
            "Peppered Chef sacrifice needs a non-Arthur ally, not Hot Cake: {legal:?}"
        );
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAlly {
                    card: Card::PepperedChef,
                    sacrifice_ally: None,
                    hot_cake_sacrifice: true,
                    ..
                }
            )),
            "Hot Cake buff is separate from ally sacrifice: {legal:?}"
        );
    }

    #[test]
    fn mercurial_heart_cards_are_recognized() {
        for name in [
            "gildas_chronicler_of_aesa",
            "incapacitate",
            "lurking_assailant",
            "undeniable_truth",
            "corhazi_arsonist",
            "ignite_fate",
            "increasing_danger",
            "reduce_to_ash",
            "smoke_out",
            "spark_alight",
        ] {
            assert!(parse_card(name).is_some(), "missing {name}");
        }
        assert_eq!(parse_card("Gildas, Chronicler of Aesa"), Some(Card::Gildas));
        assert!(Card::Gildas.is_unique());
        assert!(Card::Incapacitate.is_fast());
        assert!(Card::UndeniableTruth.is_fast());
        assert!(Card::IgniteFate.floating_memory());
        assert!(Card::ReduceToAsh.is_fire());
        assert_eq!(Card::SparkAlight.cost(), 2);
        assert_eq!(Card::SmokeOut.cost(), 1);
    }

    #[test]
    fn gildas_balance_grants_plus_three_when_hand_equals_memory() {
        let mut state = State::with_queue(&[Card::Brick, Card::Brick], true, 1, &[]);
        state.add_ally(Card::Gildas, true, false);
        assert_eq!(
            state.ally_power(state.allies[0]),
            1,
            "2 hand vs 0 memory: no Balance"
        );
        state.pay_reserve(1);
        assert_eq!(
            state.ally_power(state.allies[0]),
            4,
            "1 hand vs 1 memory: Balance +3"
        );
        state.pay_reserve(1);
        assert_eq!(
            state.ally_power(state.allies[0]),
            1,
            "0 hand vs 2 memory: no Balance"
        );
    }

    #[test]
    fn lurking_assailant_stealth_only_while_awake() {
        let mut awake = State::with_queue(&[], false, 3, &[]);
        awake.turn = 1;
        awake.add_ally(Card::LurkingAssailant, true, false);
        awake.add_ally(Card::ClumsyApprentice, true, false);
        awake.enemy_cull(None);
        assert_eq!(awake.ally_len, 1);
        assert_eq!(awake.allies[0].card(), Card::LurkingAssailant);

        let mut rested = State::with_queue(&[], false, 3, &[]);
        rested.turn = 1;
        rested.add_ally(Card::LurkingAssailant, false, false);
        rested.add_ally(Card::ClumsyApprentice, true, false);
        rested.enemy_cull(None);
        assert_eq!(
            rested.ally_len, 0,
            "rested Lurking Assailant has no stealth, cull wipes the board"
        );
    }

    #[test]
    fn corhazi_arsonist_spends_prep_for_stealth() {
        let mut state = State::with_queue(&[], false, 3, &[]);
        state.turn = 1;
        state.prep = 1;
        state.add_ally(Card::CorhaziArsonist, true, false);
        let activate = solver_actions(state, false)
            .into_iter()
            .find(|action| matches!(action, Action::ActivateArsonist(0)))
            .expect("Arsonist should offer prep-for-stealth activation");
        let (after, steps) = apply(state, activate);
        assert_eq!(after.prep, 0, "{steps:?}");
        assert!(after.allies[0].stealth(), "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Corhazi Arsonist gains stealth (−1 prep)"),
            "{steps:?}"
        );

        let mut culled = after;
        culled.enemy_cull(None);
        assert_eq!(culled.ally_len, 1, "stealthed Arsonist survives cull");

        let mut no_prep = State::with_queue(&[], false, 3, &[]);
        no_prep.turn = 1;
        no_prep.add_ally(Card::CorhaziArsonist, true, false);
        assert!(
            !solver_actions(no_prep, false)
                .iter()
                .any(|action| matches!(action, Action::ActivateArsonist(_))),
            "no prep, no activation"
        );
        no_prep.enemy_cull(None);
        assert_eq!(no_prep.ally_len, 0);

        let mut next_turn = after;
        next_turn.wake();
        assert!(
            !next_turn.allies[0].stealth(),
            "granted stealth expires at end of turn"
        );
    }

    #[test]
    fn undeniable_truth_requires_ally_sacrifice() {
        let hand = [Card::UndeniableTruth, Card::Brick, Card::Brick, Card::Brick];
        let no_ally = State::with_queue(&hand, true, 1, &[]);
        assert!(
            !solver_actions(no_ally, false).iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::UndeniableTruth,
                    ..
                }
            )),
            "Undeniable Truth needs an ally to sacrifice"
        );

        let mut state = State::with_queue(&hand, true, 1, &[Card::Brick, Card::Brick]);
        state.champion_awake = true;
        state.add_ally(Card::ClumsyApprentice, true, false);
        state.add_ally(Card::ManicZealot, true, false);
        let plays: Vec<_> = solver_actions(state, false)
            .into_iter()
            .filter(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::UndeniableTruth,
                        ..
                    }
                )
            })
            .collect();
        assert_eq!(plays.len(), 2, "one play per sacrifice target: {plays:?}");

        let zealot_play = plays
            .iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        sacrifice_ally: Some(1),
                        ..
                    }
                )
            })
            .copied()
            .expect("sacrifice slot 1");
        let (after, steps) = apply(state, zealot_play);
        assert_eq!(after.damage, 2, "Manic Zealot on-death: {steps:?}");
        assert!(after.champion_damaged, "{steps:?}");
        assert_eq!(after.ally_len, 1, "{steps:?}");
        assert_eq!(after.allies[0].card(), Card::ClumsyApprentice);
        assert_eq!(after.prep, 1, "{steps:?}");
        // Hand: 4 - 1 (Truth) - 1 (reserve) + 1 (draw) = 3.
        assert_eq!(after.hand_len, 3, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Sacrifice Manic Zealot"),
            "{steps:?}"
        );
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Undeniable Truth (draw Brick, +1 prep)"),
            "{steps:?}"
        );
    }

    #[test]
    fn ignite_fate_damages_both_champions_and_enables_heated_vengeance() {
        let hand = [
            Card::IgniteFate,
            Card::HeatedVengeance,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ];
        let mut state = State::with_queue(&hand, true, 1, &[]);
        state.champion_awake = true;
        let ignite = solver_actions(state, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::IgniteFate,
                        ..
                    }
                )
            })
            .expect("Ignite Fate should be playable");
        let (after, steps) = apply(state, ignite);
        assert_eq!(after.damage, 2, "{steps:?}");
        assert!(after.champion_damaged, "{steps:?}");
        assert_eq!(after.float_gy, 1, "{steps:?}");

        let vengeance = Action::PlayAttack {
            card: Card::HeatedVengeance,
            wield: None,
            prepared: false,
            doubled: false,
            command_ally: None,
        };
        let (after_vengeance, vengeance_steps) = apply(after, vengeance);
        assert_eq!(
            after_vengeance.damage, 7,
            "2 Ignite + 2 Heated + 3 champion-damaged bonus: {vengeance_steps:?}"
        );
    }

    #[test]
    fn increasing_danger_draws_to_hand_and_memory() {
        let hand = [Card::IncreasingDanger, Card::Brick, Card::Brick];
        let mut state = State::with_queue(&hand, true, 1, &[Card::SmokeOut, Card::SparkAlight]);
        state.champion_awake = true;
        let play = solver_actions(state, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::IncreasingDanger,
                        ..
                    }
                )
            })
            .expect("Increasing Danger should be playable");
        let (after, steps) = apply(state, play);
        assert_eq!(after.damage, 0, "{steps:?}");
        // Hand: 3 - 1 (Danger) - 2 (reserve) + 1 (draw Smoke Out) = 1.
        assert_eq!(after.hand_len, 1, "{steps:?}");
        assert!(after.has(Card::SmokeOut), "{steps:?}");
        // Two paid bricks plus Spark Alight straight into memory.
        assert_eq!(after.memory_len, 3, "{steps:?}");
        assert_eq!(after.memory[Card::SparkAlight as usize], 1, "{steps:?}");
        assert!(
            steps.iter().any(|step| {
                format_line_event(step) == "Increasing Danger (draw Smoke, memory Spark)"
            }),
            "{steps:?}"
        );
    }

    #[test]
    fn smoke_out_and_spark_alight_burn() {
        let hand = [
            Card::SmokeOut,
            Card::SparkAlight,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ];
        let result = solve_cards(&hand, true, 1, ALL_MATERIALS);
        assert_eq!(
            result.max_damage, 3,
            "Smoke Out 1 + Spark Alight 2, line: {:?}",
            result.events
        );
    }

    #[test]
    fn flurry_of_fire_should_deal_one_twice() {
        assert_eq!(
            parse_card("Aenean Flurry of Fire"),
            Some(Card::FlurryOfFire)
        );
        let state = State::with_queue(
            &[Card::FlurryOfFire, Card::Brick, Card::Brick],
            true,
            1,
            &[],
        );
        let play = Action::PlayAction {
            card: Card::FlurryOfFire,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        };
        let (after, steps) = apply(state, play);
        assert_eq!(after.damage, 2, "{steps:?}");
    }

    #[test]
    fn flurry_of_fire_should_amplify_each_hit_when_poisoned_dagger_is_active() {
        let mut state = State::with_queue(
            &[Card::FlurryOfFire, Card::Brick, Card::Brick],
            true,
            1,
            &[],
        );
        state.amplify = true;
        let play = Action::PlayAction {
            card: Card::FlurryOfFire,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        };
        let (after, steps) = apply(state, play);
        assert_eq!(after.damage, 4, "{steps:?}");
    }

    #[test]
    fn spark_alight_should_amplify_once_when_poisoned_dagger_is_active() {
        let mut state = State::with_queue(
            &[Card::SparkAlight, Card::Brick, Card::Brick],
            true,
            1,
            &[],
        );
        state.amplify = true;
        let play = Action::PlayAction {
            card: Card::SparkAlight,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        };
        let (after, steps) = apply(state, play);
        assert_eq!(after.damage, 3, "{steps:?}");
    }

    #[test]
    fn incapacitate_class_bonus_discount_and_inert_actions() {
        let hand = [Card::Incapacitate, Card::Brick, Card::Brick];
        let unleveled = State::with_queue(&hand, true, 1, &[]);
        assert!(
            !solver_actions(unleveled, false).iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::Incapacitate,
                    ..
                }
            )),
            "unleveled Incapacitate should cost 4"
        );

        let mut leveled = State::with_queue(&hand, true, 1, &[]);
        leveled.champion_level = 1;
        let play = solver_actions(leveled, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::Incapacitate,
                        ..
                    }
                )
            })
            .expect("leveled Incapacitate should cost 2");
        let (after, steps) = apply(leveled, play);
        assert_eq!(after.damage, 0, "Incapacitate is inert: {steps:?}");
        assert_eq!(after.hand_len, 0, "paid 2 reserve: {steps:?}");
        assert_eq!(after.gy[Card::Incapacitate as usize], 1, "{steps:?}");

        let ash_hand = [Card::ReduceToAsh, Card::Brick, Card::Brick, Card::Brick];
        let ash_state = State::with_queue(&ash_hand, true, 1, &[]);
        let ash = solver_actions(ash_state, false)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::ReduceToAsh,
                        ..
                    }
                )
            })
            .expect("Reduce to Ash should be playable");
        let (after_ash, ash_steps) = apply(ash_state, ash);
        assert_eq!(after_ash.damage, 0, "{ash_steps:?}");
        assert_eq!(after_ash.fire_gy, 1, "{ash_steps:?}");
    }

    #[test]
    fn fast_actions_are_offered_during_materialize() {
        let hand = [Card::SmokeOut, Card::IncreasingDanger, Card::Brick];
        let mut state = State::with_queue(&hand, true, 1, &[]);
        state.champion_awake = true;
        state.phase = Phase::Materialize;
        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::SmokeOut,
                    ..
                }
            )),
            "fast Smoke Out should be offered in materialize: {legal:?}"
        );
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::IncreasingDanger,
                    ..
                }
            )),
            "slow Increasing Danger must wait for main phase: {legal:?}"
        );
    }

    #[test]
    fn hot_cake_buffs_next_ally_attack() {
        let hand = [
            Card::HotCake,
            Card::ClumsyApprentice,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ];
        let result = solve_cards(&hand, false, 1, ALL_MATERIALS);
        assert!(
            result.max_damage >= 4,
            "Hot Cake + Clumsy should reach at least 4 damage, got {}",
            result.max_damage
        );
        assert_eq!(result.effective.max_turns, Some(1));

        let hot_cake = result
            .card_stats
            .iter()
            .find(|stat| stat.card == "hot_cake")
            .expect("hot_cake stat row");
        assert!(
            hot_cake.damage >= 3,
            "Hot Cake buff damage should attribute to Hot Cake, got {}",
            hot_cake.damage
        );
        let clumsy = result
            .card_stats
            .iter()
            .find(|stat| stat.card == "clumsy_apprentice")
            .expect("clumsy stat row");
        assert_eq!(
            clumsy.damage, 1,
            "attacking ally should only get base attack power"
        );
    }

    #[test]
    fn solver_snapshot_equivalence() {
        let drill_three = [
            Card::RendingFlames,
            Card::Arthur,
            Card::HastyMessenger,
            Card::KingdomInformant,
            Card::IgnitedStab,
            Card::SableRemnant,
            Card::ClumsyApprentice,
        ];
        let drill_one = [
            Card::BlazingThrow,
            Card::Arthur,
            Card::RedHare,
            Card::Arthur,
            Card::BlazingThrow,
            Card::KingdomInformant,
            Card::KingdomInformant,
        ];
        let ally_heavy = [
            Card::Arthur,
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::KingdomInformant,
            Card::RedHare,
            Card::PepperedChef,
        ];
        let expected_drill_three = [
            "Start of Game",
            "Activate Arthur, Young Heir",
            "Immortalize the King",
            "Main: Pass Opportunity",
            "End of Agility Phase",
            "End of End Phase",
            "Enemy Main Phase",
            "End of Enemy End Phase",
            "Wake Up Phase",
            "Materialize Impact Hammer",
            "Materialization Resolves",
            "Recollect (draw Brick)",
            "Attack from Arthur, Young Heir",
            "USE IN BELOW ATTACK (Impact Hammer)",
            "Ignited Stab (no prep) with Impact Hammer",
            "Impact Hammer self 3",
            "Activate Clumsy Apprentice",
            "Clumsy On-Enter draw (Brick)",
            "Attack from Clumsy Apprentice (Arthur +1)",
            "Activate Kingdom Informant",
            "Attack from Kingdom Informant (Arthur +1)",
            "Main: Pass Opportunity",
            "End of Agility Phase",
            "End of End Phase",
            "Enemy Main Phase",
            "End of Enemy End Phase",
            "Wake Up Phase",
            "Mem Cost for Zander Lvl 1 (from Mem)",
            "Zander Lvl 1 Glimpse/Prep",
            "Materialization Resolves",
            "Recollect (draw Brick)",
            "Attack from Kingdom Informant",
            "USE IN BELOW ATTACK (Impact Hammer)",
            "Rending Flames (Doubled) with Impact Hammer",
            "Impact Hammer self 3",
            "Materialize Mercenary's Blade (prep)",
            "Main: Pass Opportunity",
            "End of Agility Phase",
            "End of End Phase",
            "Enemy Main Phase",
            "End of Enemy End Phase",
            "Wake Up Phase",
        ];
        type SolveCase<'a> = (&'a [Card], bool, u8, u8, &'a [&'a str]);
        let cases: [SolveCase<'_>; 3] = [
            (&drill_three, true, 3, 21, &expected_drill_three),
            (&drill_one, true, 3, 24, &[]),
            (&ally_heavy, true, 3, 25, &[]),
        ];
        for (hand, go_first, max_turns, expected_damage, expected_actions) in cases {
            let result = solve_cards(hand, go_first, max_turns, ALL_MATERIALS);
            assert_eq!(result.max_damage, expected_damage, "{hand:?}");
            if !expected_actions.is_empty() {
                let actions = labels(&result.events);
                assert_eq!(actions, expected_actions, "{hand:?}");
            }
        }

        let queue: Vec<Card> = (0..16)
            .map(|index| drill_three[index % drill_three.len()])
            .collect();
        let (pass, _) =
            solve_pass(&drill_three, true, 3, &queue, true, ALL_MATERIALS).expect("solve_pass");
        assert_eq!(pass.max_damage, 21);
        assert_eq!(
            pass.events.first().map(format_line_event).as_deref(),
            Some("Start of Game")
        );
        assert!(
            pass.events
                .iter()
                .any(|step| format_line_event(step).contains("Recollect (draw Rendi)")),
            "{:?}",
            pass.events
        );
    }

    #[test]
    #[ignore]
    fn capture_solver_snapshots() {
        let drill_three = [
            Card::RendingFlames,
            Card::Arthur,
            Card::HastyMessenger,
            Card::KingdomInformant,
            Card::IgnitedStab,
            Card::SableRemnant,
            Card::ClumsyApprentice,
        ];
        let drill_one = [
            Card::BlazingThrow,
            Card::Arthur,
            Card::RedHare,
            Card::Arthur,
            Card::BlazingThrow,
            Card::KingdomInformant,
            Card::KingdomInformant,
        ];
        let ally_heavy = [
            Card::Arthur,
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::KingdomInformant,
            Card::RedHare,
            Card::PepperedChef,
        ];
        for (name, hand, go_first, max_turns) in [
            ("drill_three", &drill_three[..], true, 3),
            ("drill_one", &drill_one[..], true, 3),
            ("ally_heavy", &ally_heavy[..], true, 3),
        ] {
            let result = solve_cards(hand, go_first, max_turns, ALL_MATERIALS);
            let actions = labels(&result.events);
            println!(
                "case {name}: damage={} actions={actions:?}",
                result.max_damage
            );
        }
        let queue: Vec<Card> = (0..16)
            .map(|index| drill_three[index % drill_three.len()])
            .collect();
        let (pass, _) =
            solve_pass(&drill_three, true, 3, &queue, true, ALL_MATERIALS).expect("solve_pass");
        let actions = labels(&pass.events);
        println!(
            "case oracle_16: damage={} actions={actions:?}",
            pass.max_damage
        );
    }

    #[test]
    fn rococo_opens_for_two() {
        let hand = [Card::Rococo, Card::Brick];
        let result = solve_cards(&hand, true, 2, ALL_MATERIALS);
        assert!(result.max_damage >= 2, "{result:#?}");
        assert_eq!(
            result.effective.engine_version.card_digest,
            ENGINE_VERSION.card_digest
        );
    }

    #[test]
    fn solve_clamps_turns_and_rollouts_in_effective() {
        use crate::model::SolveRequest;
        use std::collections::BTreeMap;

        let request = SolveRequest {
            hand: vec!["rococo".into(), "brick".into()],
            go_first: true,
            max_turns: 9,
            sim_type: SimType::MonteCarlo,
            deck: BTreeMap::from([("brick".into(), 58_u8)]),
            queue: None,
            rollouts: 99,
            seed: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        };
        let result = solve(&request).unwrap();
        assert_eq!(result.effective.max_turns, Some(5));
        assert_eq!(result.effective.rollouts, Some(48));
        assert_eq!(result.effective.root_seed, 1);
    }

    #[test]
    fn vermilion_decree_imbues_on_all_fire_hand() {
        let state = State::with_queue(
            &[
                Card::VermilionDecree,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::IgnitedStab,
            ],
            false,
            1,
            &[Card::HotCake],
        );
        let legal = solver_actions(state, false);
        let decree_actions: Vec<_> = legal
            .iter()
            .filter(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::VermilionDecree,
                        ..
                    }
                )
            })
            .collect();
        assert_eq!(
            decree_actions.len(),
            1,
            "all-Fire hand only needs normal reserve: {decree_actions:?}"
        );
        let action = Action::PlayAction {
            card: Card::VermilionDecree,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        };
        let (after, steps) = apply(state, action);
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps.iter().any(|step| {
                format_line_event(step).starts_with("Vermilion Decree (Imbue, draw HCake)")
            }),
            "{steps:?}"
        );
        assert!(after.has(Card::HotCake), "imbue should draw into hand");
        assert_eq!(after.memory_len, 3);
        assert_eq!(after.hand_len, 2); // leftover IgnitedStab + drawn HotCake
    }

    #[test]
    fn vermilion_decree_offers_fire_only_when_norm_in_hand() {
        // Score-0 Fire + Informant: normal payment takes Informant first, so no imbue.
        // Fire-only is also offered so the solver can still imbue and keep the Norm.
        let state = State::with_queue(
            &[
                Card::VermilionDecree,
                Card::Rococo,
                Card::XiaoQiao,
                Card::CorhaziCourier,
                Card::KingdomInformant,
            ],
            false,
            1,
            &[Card::HotCake],
        );
        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::VermilionDecree,
                    imbue: true,
                    ..
                }
            )),
            "Fire-only alternate missing: {legal:?}"
        );
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::VermilionDecree,
                    imbue: false,
                    ..
                }
            )),
            "normal reserve line missing: {legal:?}"
        );

        let (imbued, imbue_steps) = apply(
            state,
            Action::PlayAction {
                card: Card::VermilionDecree,
                kindle: 0,
                prepared: false,
                imbue: true,
                sacrifice_ally: None,
            },
        );
        assert!(
            imbue_steps.iter().any(|event| {
                event.kind == EventKind::Play
                    && event.card == Some("vermilion_decree")
                    && event.imbue == Some(true)
                    && event.drawn.is_some()
            }),
            "{imbue_steps:?}"
        );
        assert!(imbued.has(Card::KingdomInformant));
        assert_eq!(imbued.memory[Card::KingdomInformant.index()], 0);

        let (normal, normal_steps) = apply(
            state,
            Action::PlayAction {
                card: Card::VermilionDecree,
                kindle: 0,
                prepared: false,
                imbue: false,
                sacrifice_ally: None,
            },
        );
        assert!(
            normal_steps.iter().any(|event| {
                event.kind == EventKind::Play
                    && event.card == Some("vermilion_decree")
                    && event.imbue != Some(true)
            }),
            "normal payment should reserve Informant and skip imbue: {normal_steps:?}"
        );
        assert!(
            !normal_steps
                .iter()
                .any(|event| event.card == Some("vermilion_decree") && event.imbue == Some(true)),
            "{normal_steps:?}"
        );
        assert_eq!(normal.damage, 3);
        assert!(
            normal.memory[Card::KingdomInformant.index()] > 0,
            "normal reserve uses payment scores, so Informant is fodder: memory_len={}",
            normal.memory_len
        );
        assert!(!normal.has(Card::HotCake), "no imbue draw");
    }

    #[test]
    fn vermilion_decree_normal_reserve_still_imbues_when_payment_is_all_fire() {
        // Bricks outscore Informant, so normal payment is all Fire → imbue + draw.
        let state = State::with_queue(
            &[
                Card::VermilionDecree,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::KingdomInformant,
            ],
            false,
            1,
            &[Card::HotCake],
        );
        let (after, steps) = apply(
            state,
            Action::PlayAction {
                card: Card::VermilionDecree,
                kindle: 0,
                prepared: false,
                imbue: false,
                sacrifice_ally: None,
            },
        );
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Vermilion Decree (Imbue, draw")),
            "{steps:?}"
        );
        assert!(after.has(Card::KingdomInformant));
        assert_eq!(after.memory[Card::KingdomInformant.index()], 0);
        assert!(after.has(Card::HotCake));
    }

    #[test]
    fn vermilion_decree_skips_imbue_when_norm_must_pay_cost() {
        let state = State::with_queue(
            &[
                Card::VermilionDecree,
                Card::Brick,
                Card::Brick,
                Card::KingdomInformant,
                Card::SableRemnant,
            ],
            false,
            1,
            &[],
        );
        let legal = solver_actions(state, false);
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::VermilionDecree,
                    imbue: true,
                    ..
                }
            )),
            "Imbue 3 is impossible with only 2 Fire left: {legal:?}"
        );
        let (after, steps) = apply(
            state,
            Action::PlayAction {
                card: Card::VermilionDecree,
                kindle: 0,
                prepared: false,
                imbue: false,
                sacrifice_ally: None,
            },
        );
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps.iter().any(|event| {
                event.kind == EventKind::Play
                    && event.card == Some("vermilion_decree")
                    && event.imbue != Some(true)
            }),
            "{steps:?}"
        );
        assert!(
            !steps
                .iter()
                .any(|event| event.card == Some("vermilion_decree") && event.imbue == Some(true)),
            "{steps:?}"
        );
    }

    #[test]
    fn surging_bolt_deals_four_when_imbued() {
        let state = State::with_queue(
            &[
                Card::SurgingBolt,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::IgnitedStab,
            ],
            false,
            1,
            &[],
        );
        let (after, steps) = apply(
            state,
            Action::PlayAction {
                card: Card::SurgingBolt,
                kindle: 0,
                prepared: false,
                imbue: false,
                sacrifice_ally: None,
            },
        );
        assert_eq!(after.damage, 4, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Surging Bolt (Imbue)"),
            "{steps:?}"
        );
    }

    #[test]
    fn surging_bolt_offers_fire_only_and_deals_three_without_imbue() {
        let state = State::with_queue(
            &[
                Card::SurgingBolt,
                Card::Rococo,
                Card::XiaoQiao,
                Card::CorhaziCourier,
                Card::KingdomInformant,
            ],
            false,
            1,
            &[],
        );
        let legal = solver_actions(state, false);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::SurgingBolt,
                    imbue: true,
                    ..
                }
            )),
            "Fire-only alternate missing: {legal:?}"
        );
        let (after, steps) = apply(
            state,
            Action::PlayAction {
                card: Card::SurgingBolt,
                kindle: 0,
                prepared: false,
                imbue: false,
                sacrifice_ally: None,
            },
        );
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Surging Bolt"),
            "{steps:?}"
        );
        assert!(
            !steps
                .iter()
                .any(|step| format_line_event(step).contains("Imbue")),
            "{steps:?}"
        );
    }

    #[test]
    fn two_pass_exposes_brick_oracle_and_combined_card_stats() {
        let hand = [
            "arthur",
            "clumsy_apprentice",
            "kingdom_informant",
            "brick",
            "brick",
            "brick",
            "brick",
        ]
        .map(str::to_string);
        let deck = BTreeMap::from([
            ("arthur".into(), 3_u8),
            ("clumsy_apprentice".into(), 3),
            ("kingdom_informant".into(), 3),
            ("hot_cake".into(), 3),
        ]);
        let result = solve(&SolveRequest {
            hand: hand.to_vec(),
            go_first: false,
            max_turns: 2,
            sim_type: SimType::TwoPass,
            deck,
            queue: None,
            rollouts: 1,
            seed: 42,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .expect("two-pass solve");

        let two_pass = result.two_pass.expect("two_pass payload");
        assert!(
            !two_pass.brick.card_stats.is_empty(),
            "brick pass should carry card stats"
        );
        assert!(
            !two_pass.oracle.card_stats.is_empty(),
            "oracle pass should carry card stats"
        );
        assert!(
            result.brick_line_stats.is_some(),
            "brick line stats should be retained"
        );
        assert!(
            !result.card_stats.is_empty(),
            "combined card stats should be non-empty"
        );
        let brick_damage: u32 = two_pass
            .brick
            .card_stats
            .iter()
            .map(|stat| stat.damage)
            .sum();
        let oracle_damage: u32 = two_pass
            .oracle
            .card_stats
            .iter()
            .map(|stat| stat.damage)
            .sum();
        let combined_damage: u32 = result.card_stats.iter().map(|stat| stat.damage).sum();
        assert_eq!(
            combined_damage,
            brick_damage + oracle_damage,
            "combined damage should sum both passes"
        );
    }

    #[test]
    fn oracle_only_matches_two_pass_oracle() {
        let hand = [
            "arthur",
            "clumsy_apprentice",
            "kingdom_informant",
            "brick",
            "brick",
            "brick",
            "brick",
        ]
        .map(str::to_string);
        let deck = BTreeMap::from([
            ("arthur".into(), 3_u8),
            ("clumsy_apprentice".into(), 3),
            ("kingdom_informant".into(), 3),
            ("hot_cake".into(), 3),
        ]);
        let request = |sim_type| SolveRequest {
            hand: hand.to_vec(),
            go_first: false,
            max_turns: 2,
            sim_type,
            deck: deck.clone(),
            queue: None,
            rollouts: 1,
            seed: 42,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        };
        let two_pass = solve(&request(SimType::TwoPass)).expect("two-pass solve");
        let oracle = solve(&request(SimType::OracleOnly)).expect("oracle-only solve");
        let two_pass_oracle = two_pass.two_pass.expect("two_pass payload").oracle;

        assert_eq!(oracle.sim_type, SimType::OracleOnly);
        assert!(oracle.two_pass.is_none());
        assert_eq!(oracle.max_damage, two_pass_oracle.max_damage);
        assert_eq!(oracle.events.len(), two_pass_oracle.events.len());
        assert!(!oracle.card_stats.is_empty());
    }

    #[test]
    fn oracle_only_requires_a_maindeck() {
        let result = solve(&SolveRequest {
            hand: vec!["arthur".into(), "brick".into()],
            go_first: true,
            max_turns: 2,
            sim_type: SimType::OracleOnly,
            deck: BTreeMap::new(),
            queue: None,
            rollouts: 1,
            seed: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        });
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("need a maindeck"));
    }

    #[test]
    fn oracle_uses_provided_queue_without_reshuffling() {
        let hand = vec!["arthur".into(), "brick".into()];
        let queue = vec!["hot_cake".into(), "rococo".into()];
        let seed_a = solve(&SolveRequest {
            hand: hand.clone(),
            go_first: true,
            max_turns: 2,
            sim_type: SimType::OracleOnly,
            deck: BTreeMap::new(),
            queue: Some(queue.clone()),
            rollouts: 1,
            seed: 1,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .expect("oracle with queue");
        let seed_b = solve(&SolveRequest {
            hand,
            go_first: true,
            max_turns: 2,
            sim_type: SimType::OracleOnly,
            deck: BTreeMap::new(),
            queue: Some(queue),
            rollouts: 1,
            seed: 99,
            budget: crate::budget::Budget::default(),
            materials: BTreeMap::new(),
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,

        max_card_draw: None,
        })
        .expect("oracle with same queue");
        assert_eq!(seed_a.max_damage, seed_b.max_damage);
        assert_eq!(seed_a.events.len(), seed_b.events.len());
    }

    #[test]
    fn tristan_assassin_matches_zander_on_b1a069b5_hand() {
        use crate::model::{ALL_MATERIALS, resolve_materials_bitmask};
        use std::collections::BTreeMap;

        let hand = [
            "rending_flames",
            "arthur",
            "hasty_messenger",
            "kingdom_informant",
            "ignited_stab",
            "sable_remnant",
            "clumsy_apprentice",
        ]
        .map(|id| parse_card(id).unwrap());

        let zander = solve_cards(&hand, true, 3, ALL_MATERIALS);

        let mut tristan_counts = BTreeMap::new();
        tristan_counts.insert("impact_hammer".to_string(), 1);
        tristan_counts.insert("mercenary_blade".to_string(), 1);
        tristan_counts.insert("poisoned_dagger".to_string(), 1);
        tristan_counts.insert("tristan_1".to_string(), 1);
        tristan_counts.insert("varuckan_soulknife".to_string(), 1);
        let tristan = solve_cards(&hand, true, 3, resolve_materials_bitmask(&tristan_counts));

        assert_eq!(
            zander.max_damage, tristan.max_damage,
            "Tristan Assassin should match Zander on prep lines: zander={} tristan={}",
            zander.max_damage, tristan.max_damage
        );
        assert!(
            tristan
                .events
                .iter()
                .any(|event| event.kind.as_str() == "levelTristan"),
            "optimal Tristan line should materialize Tristan"
        );
    }

    #[test]
    fn rending_flames_doubled_banishes_from_gy_before_self_enters() {
        let mut state = State::with_queue(
            &[
                Card::RendingFlames,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
            false,
            2,
            &[],
        );
        state.champion_level = 1;
        state.champion_awake = true;
        state.turn = 1;
        state.gy[Card::RendingFlames.index()] = 2;
        state.gy[Card::IgnitedStab.index()] = 1;
        state.gy_total = 3;
        state.fire_gy = 3;

        let doubled_offered = solver_actions(state, false).iter().any(|action| {
            matches!(
                action,
                Action::PlayAttack {
                    card: Card::RendingFlames,
                    doubled: true,
                    ..
                }
            )
        });
        assert!(doubled_offered, "need three Fire in GY before doubling");

        let mut sparse_gy = state;
        sparse_gy.gy[Card::RendingFlames.index()] = 2;
        sparse_gy.gy[Card::IgnitedStab.index()] = 0;
        sparse_gy.gy_total = 2;
        sparse_gy.fire_gy = 2;
        assert!(
            !solver_actions(sparse_gy, false).iter().any(|action| {
                matches!(
                    action,
                    Action::PlayAttack {
                        card: Card::RendingFlames,
                        doubled: true,
                        ..
                    }
                )
            }),
            "two Fire in GY is not enough to double"
        );

        let (after, steps) = apply(
            state,
            Action::PlayAttack {
                card: Card::RendingFlames,
                wield: None,
                prepared: false,
                doubled: true,
                command_ally: None,
            },
        );
        assert_eq!(after.gy_count(Card::RendingFlames), 1, "{steps:?}");
        assert_eq!(after.gy_count(Card::IgnitedStab), 0, "{steps:?}");
        assert_eq!(after.fire_gy, 1, "{steps:?}");
        assert_eq!(after.damage, 6, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Rending Flames (Doubled)")),
            "{steps:?}"
        );
    }

    #[test]
    fn generational_memo_reset_preserves_exact_oracle_damage() {
        let hand = [
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::IgnitedStab,
            Card::SableRemnant,
            Card::HastyMessenger,
            Card::RendingFlames,
        ];
        let board = State::with_queue(&hand, true, 2, &[Card::Brick]);

        crate::pressure::force_pressure_for_test(crate::pressure::PressureLevel::Clear);
        let mut huge = Search::with_memo_cap(true, usize::MAX / 4);
        let full = huge.visit(board);

        let mut tiny = Search::with_memo_cap(true, 256);
        let capped = tiny.visit(board);

        assert_eq!(full.damage, capped.damage);
        assert_eq!(full.influence, capped.influence);
        assert!(
            tiny.memo_generations > 0,
            "tiny cap should force at least one generational reset"
        );
    }

    #[test]
    fn squeeze_multiplier_still_yields_exact_damage() {
        let hand = [
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::IgnitedStab,
        ];
        let board = State::with_queue(&hand, true, 1, &[]);

        crate::pressure::force_pressure_for_test(crate::pressure::PressureLevel::Clear);
        let mut full_search = Search::with_memo_cap(false, 10_000);
        let full = full_search.visit(board);

        crate::pressure::force_pressure_for_test(crate::pressure::PressureLevel::Squeeze);
        let mut squeezed = Search::with_memo_cap(false, 10_000);
        let under_pressure = squeezed.visit(board);
        crate::pressure::force_pressure_for_test(crate::pressure::PressureLevel::Clear);

        assert_eq!(full.damage, under_pressure.damage);
        assert_eq!(full.influence, under_pressure.influence);
    }

    #[test]
    fn cancel_flag_aborts_long_oracle_pass() {
        // Needs enough nodes to hit the park/cancel checkpoint mask (~262k).
        let hand = [
            Card::Arthur,
            Card::XiaoQiao,
            Card::DazzlingCourtesan,
            Card::ClumsyApprentice,
            Card::Rococo,
            Card::Rococo,
            Card::HotCake,
        ];
        let queue: Vec<_> = std::iter::repeat_n(Card::Brick, 40).collect();
        let flag = crate::cancel::new_flag();
        let flag_set = flag.clone();
        let handle = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(20));
            crate::cancel::request(&flag_set);
        });
        let _guard = crate::cancel::install(flag);
        let err = solve_pass(&hand, true, 3, &queue, true, ALL_MATERIALS).expect_err("cancelled");
        assert!(matches!(err, EngineError::Cancelled));
        handle.join().expect("cancel thread");
    }
}
