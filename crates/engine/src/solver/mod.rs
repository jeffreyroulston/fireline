//! Opening-hand solver: search and simulation modes.
//!
//! Legal actions and apply live in [`crate::rules`]; this module consumes them
//! with [`RulesMode::SolverReduced`](crate::rules::RulesMode::SolverReduced) and
//! [`ApplyOpts::SOLVER`](crate::rules::ApplyOpts::SOLVER).

mod hash;
mod memory;
pub(crate) mod search;
mod sim;

#[cfg(test)]
mod tests;

pub use crate::rules::{
    ActionPayment, AttackDiscardStep, DiscardPayment, DiscardRequirement, PaymentRequirement,
    action_discard_hand, action_discard_required, action_payment_required,
    ally_attack_discard_requirement, apply_action, apply_action_with_payment, attack_discard_steps,
    legal_actions, preview_hand_for_attack_discard,
};
pub use hash::opening_hand_hash;
pub(crate) use sim::solve_for_deck_eval;
pub use sim::{solve, solve_cards, solve_pass, solve_with_progress};
