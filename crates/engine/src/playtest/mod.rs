//! Interactive playtest protocol between the worker and the engine.
//!
//! Legal actions use [`crate::rules::RulesMode::Full`]. Apply uses
//! [`crate::rules::ApplyOpts::FULL`] (no solver enemy cull on turn advance).

mod actions;
mod payment;
mod state;
mod types;

#[cfg(test)]
mod tests;

pub use types::*;

use crate::error::Result;
use crate::line_event::EventTape;
use crate::rules::{
    ApplyOpts, RulesMode, action_discard_hand, action_discard_required, action_payment_required,
    apply_action_with_opts, attack_discard_steps, legal_actions_with_mode, legal_attack_targets,
};

use actions::{action_to_playtest, format_action, playtest_to_action};
use payment::payment_from_playtest_action;
use state::{engine_to_state, materials_from_map, parse_hand, parse_queue, state_view};

/// Build the initial playtest state and opening event tape.
///
/// # Errors
///
/// Returns [`EngineError::UnknownCard`] when a hand or queue entry is not recognized,
/// or [`EngineError::InvalidRequest`] when inputs fail validation.
pub fn playtest_init(request: &PlaytestInitRequest) -> Result<PlaytestInitResult> {
    let hand = parse_hand(&request.hand)?;
    let queue = parse_queue(&request.queue)?;
    let materials = materials_from_map(&request.materials);
    let mut state = crate::model::State::with_queue_and_materials(
        &hand,
        request.go_first,
        request.max_turns,
        &queue,
        materials,
    );
    let mut tape = EventTape::new();
    let opening_draw = if request.go_first {
        None
    } else {
        Some(state.draw_unknown())
    };
    tape.push_start(state, opening_draw);
    Ok(PlaytestInitResult {
        state: state_view(state),
        events: tape.events,
    })
}

/// List legal actions for the current playtest state with payment/discard metadata.
///
/// # Errors
///
/// Returns [`EngineError::InvalidRequest`] when the serialized engine state is invalid.
pub fn playtest_legal_actions(
    request: &PlaytestLegalActionsRequest,
) -> Result<PlaytestLegalActionsResult> {
    let state = engine_to_state(&request.state);
    // Interactive clients (play + workbench line) must never see SolverReduced.
    let actions = legal_actions_with_mode(state, RulesMode::Full)
        .into_iter()
        .map(|action| {
            let payment = action_payment_required(state, action);
            let discard = action_discard_required(state, action);
            let discard_hand_view = action_discard_hand(state, action);
            let attack_steps = attack_discard_steps(state, action);
            let discard_steps: Vec<PlaytestDiscardStep> = attack_steps
                .into_iter()
                .map(|step| PlaytestDiscardStep {
                    label: step.label,
                    discard_optional: step.optional,
                    discard_hand: step.hand.iter().map(|card| card.id().to_string()).collect(),
                    drawn_discard_index: step.drawn_index,
                })
                .collect();
            let first_discard_step = discard_steps.first();
            PlaytestActionOption {
                action: action_to_playtest(action),
                label: format_action(state, action),
                reserve_count: payment.map(|req| req.reserve).unwrap_or(0),
                fire_only: payment.map(|req| req.fire_only).unwrap_or(false),
                played_card: payment
                    .and_then(|req| req.played_card)
                    .map(|card| card.id().to_string()),
                discard_optional: first_discard_step
                    .map(|step| step.discard_optional)
                    .or_else(|| discard.map(|req| req.optional))
                    .unwrap_or(false),
                discard_hand: first_discard_step
                    .map(|step| step.discard_hand.clone())
                    .or_else(|| {
                        discard_hand_view.as_ref().map(|(slots, _)| {
                            slots.iter().map(|card| card.id().to_string()).collect()
                        })
                    })
                    .unwrap_or_default(),
                drawn_discard_index: first_discard_step
                    .and_then(|step| step.drawn_discard_index)
                    .or_else(|| discard_hand_view.and_then(|(_, index)| index)),
                discard_steps,
            }
        })
        .collect();
    Ok(PlaytestLegalActionsResult { actions })
}

/// Legal attack targets on an opponent public board for a chosen attacker.
///
/// # Errors
///
/// Returns [`EngineError::InvalidRequest`] when the serialized engine state is invalid.
pub fn playtest_legal_targets(
    request: &PlaytestLegalTargetsRequest,
) -> Result<PlaytestLegalTargetsResult> {
    let state = engine_to_state(&request.state);
    let targets = legal_attack_targets(state, request.attacker, &request.opponent);
    Ok(PlaytestLegalTargetsResult { targets })
}

/// Apply a playtest action and return the next state plus line events.
///
/// # Errors
///
/// Returns [`EngineError::UnknownCard`] for unrecognized card ids, or
/// [`EngineError::InvalidRequest`] when payment, reserve, or discard requirements are not met.
pub fn playtest_apply(request: &PlaytestApplyRequest) -> Result<PlaytestApplyResult> {
    let state = engine_to_state(&request.state);
    let action = playtest_to_action(&request.action)?;
    let payment = payment_from_playtest_action(&request.action, state, action)?;
    let (next, events) = apply_action_with_opts(state, action, payment, ApplyOpts::FULL);
    Ok(PlaytestApplyResult {
        state: state_view(next),
        events,
    })
}
