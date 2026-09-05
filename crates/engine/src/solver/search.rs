//! Memoized search over legal action sequences.

use crate::{cards::Card, line_event::EventTape, model::Action, model::State};
use rustc_hash::FxHashMap;

use crate::rules::{
    ActionPayment, DiscardPayment, action_needs_reserve_search, apply_into, apply_silent,
    apply_silent_with_payment, enumerate_reservations, optimistic_remaining_damage,
    order_actions_damage_first, reservation_budget, solver_actions, ApplyOpts,
};
use super::hash::{opening_hand_hash, opening_hand_label};
use super::memory::release_process_memory;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct Outcome {
    pub(crate) damage: u8,
    pub(crate) influence: u8,
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
pub(crate) struct MemoValue {
    damage_gain: u8,
    end_influence: u8,
}

/// Park / generational-reset checkpoint cadence (~262k nodes).
const PARK_CHECK_MASK: u64 = 0x3_FFFF;

/// Below this reservation budget, skip bound pruning and finish the line.
const FINISH_RESERVE_THRESHOLD: u8 = 5;

pub(crate) struct Search {
    pub(crate) memo: FxHashMap<State, MemoValue>,
    pub(crate) nodes: u64,
    pub(crate) glimpse_enabled: bool,
    pub(crate) exhaustive_reservation: bool,
    /// Base entry cap; live limit is scaled by pressure squeeze.
    memo_cap: usize,
    pub(crate) memo_generations: u32,
    /// Set when cooperative cancel fires mid-search; visit returns early.
    pub(crate) aborted: bool,
    /// Set when the per-hand wall-clock deadline fires mid-search.
    pub(crate) timed_out: bool,
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
    pub(crate) fn new(glimpse_enabled: bool, exhaustive_reservation: bool) -> Self {
        Self::with_memo_cap(
            glimpse_enabled,
            exhaustive_reservation,
            crate::pressure::memo_cap_entries(),
        )
    }

    pub(crate) fn with_memo_cap(
        glimpse_enabled: bool,
        exhaustive_reservation: bool,
        memo_cap: usize,
    ) -> Self {
        Self {
            memo: FxHashMap::with_capacity_and_hasher(16_384, Default::default()),
            nodes: 0,
            glimpse_enabled,
            exhaustive_reservation,
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
    pub(crate) fn reset(&mut self, glimpse_enabled: bool) {
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

    pub(crate) fn set_opening_hand(&mut self, hand: &[Card]) {
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

    pub(crate) fn visit(&mut self, state: State) -> Outcome {
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
            let outcome = self.visit_action(state, action);
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

    fn visit_action(&mut self, state: State, action: Action) -> Outcome {
        if self.exhaustive_reservation && action_needs_reserve_search(state, action) {
            let mut best = Outcome {
                damage: state.damage,
                influence: 0,
            };
            for reserved in enumerate_reservations(state, action) {
                let payment = ActionPayment {
                    reserved,
                    discard: DiscardPayment::Auto,
                    discards: vec![],
                };
                let next = apply_silent_with_payment(state, action, &payment);
                let outcome = self.visit(next);
                if self.aborted {
                    return outcome;
                }
                if outcome.better(best) {
                    best = outcome;
                }
            }
            return best;
        }
        self.visit(apply_silent(state, action))
    }

    pub(crate) fn reconstruct(
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
            if self.exhaustive_reservation && action_needs_reserve_search(state, action) {
                for reserved in enumerate_reservations(state, action) {
                    let saved = tape.checkpoint();
                    let payment = ActionPayment {
                        reserved,
                        discard: DiscardPayment::Auto,
                        discards: vec![],
                    };
                    let next = apply_into(state, action, tape, Some(&payment), ApplyOpts::SOLVER);
                    if self.visit(next) == target {
                        let burst = &tape.events[saved.events_len..];
                        stats.record_action(action, state, next, burst);
                        self.bound_prune = prune;
                        self.reconstruct(next, target, tape, stats);
                        return;
                    }
                    tape.restore(saved);
                }
                continue;
            }
            let saved = tape.checkpoint();
            let next = apply_into(state, action, tape, None, ApplyOpts::SOLVER);
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
