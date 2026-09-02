//! Payment and discard requirements for legal actions.

use crate::cards::Card;
use crate::model::{Action, State};

use super::actions::action_cost;

/// Manual reserve / discard selection for interactive playtest.
#[derive(Clone, Debug)]
pub struct ActionPayment {
    pub reserved: Vec<Card>,
    pub discard: DiscardPayment,
    /// One payment per on-attack discard step (e.g. multiple allies in Attack Others).
    pub discards: Vec<DiscardPayment>,
}

/// How to resolve an optional discard effect during playtest apply.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum DiscardPayment {
    #[default]
    Auto,
    Skip,
    Card(Card),
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

pub(crate) fn resolve_discard(state: &mut State, payment: DiscardPayment) -> Option<Card> {
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

pub fn ally_attack_discard_requirement(
    state: State,
    card: Card,
) -> Option<DiscardRequirement> {
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
                if let Some(req) =
                    ally_attack_discard_requirement(state, state.allies[index].card())
                {
                    return Some(req);
                }
            }
            None
        }
        _ => None,
    }
}

/// One on-attack discard prompt while previewing an attack action.
#[derive(Clone, Debug)]
pub struct AttackDiscardStep {
    pub label: String,
    pub optional: bool,
    pub hand: Vec<Card>,
    pub drawn_index: Option<u8>,
}

pub fn preview_hand_for_attack_discard(
    mut state: State,
    index: usize,
    req: DiscardRequirement,
) -> (Vec<Card>, Option<u8>) {
    if req.draw_before_discard {
        let card = state.allies[index].card();
        if card == Card::CorhaziCourier && state.is_assassin() {
            let before_count = state.hand;
            let drawn = state.draw_unknown();
            let slots = state.hand_slots();
            let drawn_index = drawn_slot_index(&slots, drawn, before_count[drawn.index()]);
            return (slots, drawn_index);
        }
    }
    (state.hand_slots(), None)
}

pub(crate) fn next_discard_payment(
    discards: &mut Vec<DiscardPayment>,
    fallback: &mut DiscardPayment,
    state: State,
    card: Card,
) -> DiscardPayment {
    if ally_attack_discard_requirement(state, card).is_none() {
        return DiscardPayment::Auto;
    }
    if let Some(payment) = discards.first().copied() {
        discards.remove(0);
        return payment;
    }
    if *fallback != DiscardPayment::Auto {
        let pay = *fallback;
        *fallback = DiscardPayment::Auto;
        return pay;
    }
    DiscardPayment::Auto
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

fn simulate_draw_before_discard(
    mut state: State,
    action: Action,
) -> Option<(Vec<Card>, Option<u8>)> {
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
