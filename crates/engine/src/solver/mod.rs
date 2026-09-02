//! Opening-hand solver: search, simulation modes, legal actions, and apply.

mod actions;
mod apply;
mod hash;
mod memory;
mod payment;
pub(crate) mod search;
mod sim;

#[cfg(test)]
mod tests;

pub use actions::legal_actions;
pub use apply::{apply_action, apply_action_with_payment, attack_discard_steps};
pub use hash::opening_hand_hash;
pub use payment::{
    ActionPayment, AttackDiscardStep, DiscardPayment, DiscardRequirement, PaymentRequirement,
    action_discard_hand, action_discard_required, action_payment_required,
    ally_attack_discard_requirement, preview_hand_for_attack_discard,
};
pub(crate) use apply::advance_attack_ally_silent;
pub(crate) use sim::solve_for_deck_eval;
pub use sim::{solve, solve_cards, solve_pass, solve_with_progress};
