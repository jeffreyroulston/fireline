//! Game rules: legal actions and apply, without search heuristics.
//!
//! [`RulesMode::Full`] enumerates interactive legality. [`RulesMode::SolverReduced`]
//! applies FiZa search dominance reductions (Mate collapse, forced dagger, Arthur
//! gating, refuse last-hand pure draw). Solver post-turn opponent cull is selected
//! via [`TurnAdvancePolicy`], not baked into Full play apply.

mod actions;
mod apply;
mod apply_effect;
mod combat_targets;
mod payment;

#[cfg(test)]
mod tests;

pub use actions::{legal_actions, legal_actions_with_mode};
pub(crate) use actions::{
    optimistic_remaining_damage, order_actions_damage_first, reservation_budget, solver_actions,
};
#[cfg(test)]
pub(crate) use actions::{
    collapse_mate_ending_siblings, optimistic_remaining_from_reserve,
};
pub(crate) use apply::advance_attack_ally_silent;
pub use apply::{
    ApplyOpts, TurnAdvancePolicy, apply_action, apply_action_with_opts, apply_action_with_payment,
    attack_discard_steps,
};
pub(crate) use apply::{apply_into, apply_silent, apply_silent_with_payment};
pub use combat_targets::{
    AttackTarget, AttackerRef, OpponentAllyView, OpponentView, legal_attack_targets,
};
pub use payment::{
    ActionPayment, AttackDiscardStep, DiscardPayment, DiscardRequirement, PaymentRequirement,
    action_discard_hand, action_discard_required, action_payment_required,
    ally_attack_discard_requirement, enumerate_reservations, preview_hand_for_attack_discard,
};
pub(crate) use payment::action_needs_reserve_search;

use thiserror::Error;

use crate::line_event::LineEvent;
use crate::model::{Action, State};

/// How legal actions are filtered.
///
/// `Full` is for play / playtest. `SolverReduced` is for search only — never use it
/// as the source of truth for what a player may do at the table.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RulesMode {
    /// Interactive legality: no search dominance reductions.
    Full,
    /// Solver enumeration with safe reductions (Mate collapse, dagger-first, …).
    SolverReduced,
}

/// Errors from rules apply / payment validation at the rules boundary.
#[derive(Debug, Error)]
pub enum RulesError {
    #[error("{0}")]
    Invalid(String),
}

impl RulesError {
    #[allow(dead_code)] // used once payment validation moves into rules apply
    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid(message.into())
    }
}

pub type RulesResult<T> = std::result::Result<T, RulesError>;

/// Apply one action under the given turn-advance policy.
///
/// Consumes `State` by value (`State` is `Copy`). Callers that need the prior
/// board should copy first.
///
/// # Errors
///
/// Reserved for in-rules payment validation; today always returns `Ok` for a
/// structurally applied action (same contract as the former solver apply).
pub fn apply(
    state: State,
    action: Action,
    payment: Option<ActionPayment>,
    opts: ApplyOpts,
) -> RulesResult<(State, Vec<LineEvent>)> {
    Ok(apply_action_with_opts(state, action, payment, opts))
}
