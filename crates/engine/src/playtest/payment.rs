//! Playtest payment and reserve resolution.

use crate::cards::{ALL_CARDS, CARD_COUNT, Card};
use crate::error::{EngineError, Result};
use crate::model::{Action, State};
use crate::rules::{
    ActionPayment, DiscardPayment, PaymentRequirement, action_discard_hand,
    action_discard_required, action_payment_required, advance_attack_ally_silent,
    ally_attack_discard_requirement, attack_discard_steps, preview_hand_for_attack_discard,
};

use super::state::{hand_slots, parse_reserved};
use super::types::*;

fn discard_choice_from_action(action: &PlaytestAction) -> (Option<bool>, Option<u8>) {
    match action {
        PlaytestAction::PlayAlly {
            skip_discard,
            discard_hand_index,
            ..
        }
        | PlaytestAction::AttackArthur {
            skip_discard,
            discard_hand_index,
            ..
        }
        | PlaytestAction::AttackOthers {
            skip_discard,
            discard_hand_index,
            ..
        } => (*skip_discard, *discard_hand_index),
        _ => (None, None),
    }
}

fn attack_discard_choices_from_action(action: &PlaytestAction) -> Vec<Option<u8>> {
    match action {
        PlaytestAction::AttackArthur {
            discard_hand_indices,
            skip_discard,
            discard_hand_index,
            ..
        }
        | PlaytestAction::AttackOthers {
            discard_hand_indices,
            skip_discard,
            discard_hand_index,
            ..
        } => {
            if !discard_hand_indices.is_empty() {
                return discard_hand_indices.clone();
            }
            if skip_discard == &Some(true) {
                vec![None]
            } else if let Some(index) = discard_hand_index {
                vec![Some(*index)]
            } else {
                vec![]
            }
        }
        _ => vec![],
    }
}

fn discard_payment_from_choice(
    choice: Option<u8>,
    _state: State,
    requirement: crate::solver::DiscardRequirement,
    reserve_requirement: Option<PaymentRequirement>,
    action: &PlaytestAction,
    slots: &[Card],
) -> Result<DiscardPayment> {
    match choice {
        None => {
            if !requirement.optional {
                return Err(EngineError::invalid("Select a card to discard."));
            }
            Ok(DiscardPayment::Skip)
        }
        Some(index) => {
            let card = slots
                .get(index as usize)
                .copied()
                .ok_or_else(|| EngineError::invalid("Discard index is out of range."))?;
            if let Some(payment) = reserve_requirement {
                let (_, reserved_indices) = reserved_from_action(action);
                validate_discard_slot(index, slots, payment, reserved_indices)?;
            }
            Ok(DiscardPayment::Card(card))
        }
    }
}

fn attack_discard_payments_from_action(
    action: &PlaytestAction,
    mut state: State,
    engine_action: Action,
    reserve_requirement: Option<PaymentRequirement>,
) -> Result<Vec<DiscardPayment>> {
    let expected = attack_discard_steps(state, engine_action).len();
    if expected == 0 {
        return Ok(Vec::new());
    }
    let choices = attack_discard_choices_from_action(action);
    if choices.len() != expected {
        return Err(EngineError::invalid(format!(
            "Expected {expected} discard choices, got {}.",
            choices.len()
        )));
    }
    let mut payments = Vec::with_capacity(expected);
    let mut choice_iter = choices.into_iter();
    match engine_action {
        Action::AttackArthur(index) => {
            let index = index as usize;
            if index < state.ally_len as usize && state.can_ally_attack(index) {
                let card = state.allies[index].card();
                if let Some(req) = ally_attack_discard_requirement(state, card) {
                    let choice = choice_iter.next().expect("choice count checked");
                    let slots = preview_hand_for_attack_discard(state, index, req).0;
                    payments.push(discard_payment_from_choice(
                        choice,
                        state,
                        req,
                        reserve_requirement,
                        action,
                        &slots,
                    )?);
                }
            }
        }
        Action::AttackOthers => {
            let mut index = 0;
            while index < state.ally_len as usize {
                if state.allies[index].card() != Card::Arthur && state.can_ally_attack(index) {
                    let card = state.allies[index].card();
                    if let Some(req) = ally_attack_discard_requirement(state, card) {
                        let choice = choice_iter.next().expect("choice count checked");
                        let slots = preview_hand_for_attack_discard(state, index, req).0;
                        let payment = discard_payment_from_choice(
                            choice,
                            state,
                            req,
                            reserve_requirement,
                            action,
                            &slots,
                        )?;
                        payments.push(payment);
                        advance_attack_ally_silent(&mut state, index, payment);
                    } else {
                        advance_attack_ally_silent(&mut state, index, DiscardPayment::Auto);
                    }
                }
                index += 1;
            }
        }
        _ => {}
    }
    Ok(payments)
}

fn discard_payment_from_action(
    action: &PlaytestAction,
    state: State,
    engine_action: Action,
    requirement: Option<crate::solver::DiscardRequirement>,
    reserve_requirement: Option<PaymentRequirement>,
) -> Result<DiscardPayment> {
    let (skip_discard, discard_hand_index) = discard_choice_from_action(action);
    match requirement {
        None => Ok(DiscardPayment::Auto),
        Some(req) => {
            if skip_discard == Some(true) {
                if !req.optional {
                    return Err(EngineError::invalid(
                        "This discard effect cannot be skipped.",
                    ));
                }
                Ok(DiscardPayment::Skip)
            } else if let Some(index) = discard_hand_index {
                let slots = action_discard_hand(state, engine_action)
                    .map(|(slots, _)| slots)
                    .unwrap_or_else(|| hand_slots(state));
                let card = slots
                    .get(index as usize)
                    .copied()
                    .ok_or_else(|| EngineError::invalid("Discard index is out of range."))?;
                if let Some(payment) = reserve_requirement {
                    let (_, reserved_indices) = reserved_from_action(action);
                    validate_discard_slot(index, &slots, payment, reserved_indices)?;
                }
                Ok(DiscardPayment::Card(card))
            } else {
                Err(EngineError::invalid(if req.optional {
                    "Select a card to discard or skip the discard effect."
                } else {
                    "Select a card to discard."
                }))
            }
        }
    }
}

fn validate_discard_slot(
    index: u8,
    slots: &[Card],
    payment: PaymentRequirement,
    reserved_indices: &[u8],
) -> Result<()> {
    if index as usize >= slots.len() {
        return Err(EngineError::invalid("Discard index is out of range."));
    }
    let mut unavailable: std::collections::BTreeSet<usize> =
        reserved_indices.iter().map(|&i| i as usize).collect();
    if let Some(played) = payment.played_card {
        for (slot, card) in slots.iter().enumerate() {
            if *card == played && !unavailable.contains(&slot) {
                unavailable.insert(slot);
                break;
            }
        }
    }
    if unavailable.contains(&(index as usize)) {
        return Err(EngineError::invalid(
            "Cannot discard a card reserved for payment or being played.",
        ));
    }
    Ok(())
}

pub(super) fn reserved_from_action(action: &PlaytestAction) -> (&[String], &[u8]) {
    match action {
        PlaytestAction::PlayAlly {
            reserved,
            reserved_hand_indices,
            ..
        }
        | PlaytestAction::PlayItem {
            reserved,
            reserved_hand_indices,
            ..
        }
        | PlaytestAction::PlayAttack {
            reserved,
            reserved_hand_indices,
            ..
        }
        | PlaytestAction::PlayAction {
            reserved,
            reserved_hand_indices,
            ..
        }
        | PlaytestAction::BlazingThrow {
            reserved,
            reserved_hand_indices,
            ..
        } => (reserved, reserved_hand_indices),
        _ => (&[], &[]),
    }
}

fn reserved_from_hand_indices(
    state: State,
    indices: &[u8],
    requirement: PaymentRequirement,
) -> Result<Vec<Card>> {
    let slots = hand_slots(state);
    if indices.len() != requirement.reserve as usize {
        return Err(EngineError::invalid(format!(
            "Expected {} reserve cards, got {}.",
            requirement.reserve,
            indices.len()
        )));
    }
    let mut used = vec![false; slots.len()];
    let mut cards = Vec::with_capacity(indices.len());
    for &index in indices {
        let index = index as usize;
        if index >= slots.len() || used[index] {
            return Err(EngineError::invalid(
                "Reserve selection must use unique hand indices.",
            ));
        }
        used[index] = true;
        cards.push(slots[index]);
    }
    if let Some(played) = requirement.played_card {
        let played_in_hand = slots.iter().filter(|&&card| card == played).count();
        let played_in_reserve = cards.iter().filter(|&&card| card == played).count();
        if played_in_reserve >= played_in_hand {
            return Err(EngineError::invalid(
                "Reserved cards must exclude the card being played.",
            ));
        }
    }
    if requirement.fire_only {
        for card in &cards {
            if !card.is_fire() {
                return Err(EngineError::invalid(
                    "Imbue reserve payment must use Fire cards only.",
                ));
            }
        }
    }
    Ok(cards)
}

fn resolve_reserved_cards(
    action: &PlaytestAction,
    state: State,
    requirement: PaymentRequirement,
) -> Result<Vec<Card>> {
    let (reserved, indices) = reserved_from_action(action);
    if !indices.is_empty() {
        return reserved_from_hand_indices(state, indices, requirement);
    }
    if reserved.is_empty() {
        return Err(EngineError::invalid(
            "Select cards to reserve before playing this action.",
        ));
    }
    if reserved.len() != requirement.reserve as usize {
        return Err(EngineError::invalid(format!(
            "Expected {} reserve cards, got {}.",
            requirement.reserve,
            reserved.len()
        )));
    }
    let cards = parse_reserved(reserved)?;
    if let Some(played) = requirement.played_card {
        let mut available = state.hand;
        available[played.index()] = available[played.index()].saturating_sub(1);
        let mut needed = [0_u8; CARD_COUNT];
        for card in &cards {
            needed[card.index()] = needed[card.index()].saturating_add(1);
        }
        for card in ALL_CARDS {
            if available[card.index()] < needed[card.index()] {
                return Err(EngineError::invalid(
                    "Reserved cards must come from hand and exclude the card being played.",
                ));
            }
        }
    }
    if requirement.fire_only {
        for card in &cards {
            if !card.is_fire() {
                return Err(EngineError::invalid(
                    "Imbue reserve payment must use Fire cards only.",
                ));
            }
        }
    }
    Ok(cards)
}

pub(super) fn payment_from_playtest_action(
    action: &PlaytestAction,
    state: State,
    engine_action: Action,
) -> Result<Option<ActionPayment>> {
    let reserve_requirement = action_payment_required(state, engine_action);
    let attack_discards =
        attack_discard_payments_from_action(action, state, engine_action, reserve_requirement)?;
    let discard_requirement = if attack_discards.is_empty() {
        action_discard_required(state, engine_action)
    } else {
        None
    };
    let needs_reserve = reserve_requirement
        .map(|req| req.reserve > 0)
        .unwrap_or(false);
    let needs_discard = !attack_discards.is_empty() || discard_requirement.is_some();

    let reserved = if needs_reserve {
        let requirement = reserve_requirement.expect("reserve requirement");
        resolve_reserved_cards(action, state, requirement)?
    } else {
        Vec::new()
    };

    let discard = if attack_discards.is_empty() {
        discard_payment_from_action(
            action,
            state,
            engine_action,
            discard_requirement,
            reserve_requirement,
        )?
    } else {
        attack_discards[0]
    };

    if !needs_reserve && !needs_discard {
        return Ok(None);
    }

    Ok(Some(ActionPayment {
        reserved,
        discard,
        discards: attack_discards,
    }))
}
