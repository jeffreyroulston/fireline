//! Dual-board attack target legality (engine-owned rules).
//!
//! The actor seat is a full [`State`]. The defender is summarized as
//! [`OpponentView`] (public field only). Complex multi-board combat resolve is v3.

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts")]
use ts_rs::TS;

use crate::model::State;

/// Who is declaring the attack on the actor seat.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum AttackerRef {
    Champion,
    Ally { index: u8 },
}

/// Legal attack destination on the opponent's public board.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum AttackTarget {
    Champion,
    Ally { index: u8 },
}

/// One opponent ally as seen for targeting (no hand / deck).
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct OpponentAllyView {
    pub index: u8,
    pub card: String,
    pub awake: bool,
    pub stealth: bool,
    pub taunt: bool,
    pub power: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub life: Option<u8>,
    pub damage_marked: u8,
}

/// Public opponent board for attack targeting.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct OpponentView {
    pub champion_awake: bool,
    /// Duel champion life (or Spirit stand-in). Not used for stealth/taunt filters.
    pub champion_life: u8,
    pub allies: Vec<OpponentAllyView>,
}

impl OpponentView {
    /// Build from a defender [`State`]. `champion_life` is supplied by the duel layer
    /// (defaults to remaining Spirit-style life from damage if callers pass that).
    pub fn from_state(state: State, champion_life: u8) -> Self {
        let mut allies = Vec::with_capacity(state.ally_len as usize);
        for index in 0..state.ally_len as usize {
            let ally = state.allies[index];
            let card = ally.card();
            let printed_stealth = card.is_stealth()
                || (card.assassin_stealth() && state.is_assassin());
            allies.push(OpponentAllyView {
                index: index as u8,
                card: card.id().to_string(),
                awake: ally.awake(),
                stealth: ally.stealth() || printed_stealth,
                taunt: card.is_taunt(),
                power: state.ally_power(ally),
                life: card.life(),
                damage_marked: ally.damage_marked(),
            });
        }
        Self {
            champion_awake: state.champion_awake,
            champion_life,
            allies,
        }
    }
}

fn attacker_has_true_sight(actor: State, attacker: AttackerRef) -> bool {
    match attacker {
        AttackerRef::Champion => {
            // V2: champion attacks gain true sight only from a True Sight weapon keyword.
            // No True Sight weapons in catalog yet — reserved for catalog wiring.
            false
        }
        AttackerRef::Ally { index } => {
            let index = index as usize;
            if index >= actor.ally_len as usize {
                return false;
            }
            actor.allies[index].card().is_true_sight()
        }
    }
}

fn attacker_can_declare(actor: State, attacker: AttackerRef) -> bool {
    match attacker {
        AttackerRef::Champion => {
            actor.champion_awake && !(actor.go_first && actor.turn == 0)
        }
        AttackerRef::Ally { index } => actor.can_ally_attack(index as usize),
    }
}

/// Legal attack targets on `opponent` for `attacker` on `actor` (Full / duel rules).
pub fn legal_attack_targets(
    actor: State,
    attacker: AttackerRef,
    opponent: &OpponentView,
) -> Vec<AttackTarget> {
    if !attacker_can_declare(actor, attacker) {
        return Vec::new();
    }
    let true_sight = attacker_has_true_sight(actor, attacker);

    let mut candidates: Vec<AttackTarget> = Vec::new();
    candidates.push(AttackTarget::Champion);
    for ally in &opponent.allies {
        if ally.stealth && !true_sight {
            continue;
        }
        candidates.push(AttackTarget::Ally { index: ally.index });
    }

    let awake_taunts: Vec<u8> = opponent
        .allies
        .iter()
        .filter(|ally| {
            ally.taunt
                && ally.awake
                && (!ally.stealth || true_sight)
        })
        .map(|ally| ally.index)
        .collect();

    if !awake_taunts.is_empty() {
        return awake_taunts
            .into_iter()
            .map(|index| AttackTarget::Ally { index })
            .collect();
    }

    candidates
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::Card;
    use crate::model::Phase;

    fn base_actor() -> State {
        let mut state = State::with_queue(&[], true, 3, &[]);
        state.phase = Phase::Main;
        state.turn = 1;
        state.champion_awake = true;
        state.add_ally(Card::Arthur, true, true);
        state.add_ally(Card::ClumsyApprentice, true, false);
        state
    }

    fn opponent_with(allies: Vec<OpponentAllyView>) -> OpponentView {
        OpponentView {
            champion_awake: true,
            champion_life: 15,
            allies,
        }
    }

    #[test]
    fn stealth_ally_blocked_without_true_sight() {
        let actor = base_actor();
        let opponent = opponent_with(vec![OpponentAllyView {
            index: 0,
            card: Card::KingdomInformant.id().to_string(),
            awake: true,
            stealth: true,
            taunt: false,
            power: 1,
            life: Some(2),
            damage_marked: 0,
        }]);
        let targets = legal_attack_targets(actor, AttackerRef::Ally { index: 0 }, &opponent);
        assert_eq!(targets, vec![AttackTarget::Champion]);
    }

    #[test]
    fn taunt_restricts_to_awake_taunt_allies() {
        let actor = base_actor();
        let opponent = opponent_with(vec![
            OpponentAllyView {
                index: 0,
                card: "taunt_dummy".into(),
                awake: true,
                stealth: false,
                taunt: true,
                power: 2,
                life: Some(3),
                damage_marked: 0,
            },
            OpponentAllyView {
                index: 1,
                card: Card::ClumsyApprentice.id().to_string(),
                awake: true,
                stealth: false,
                taunt: false,
                power: 1,
                life: Some(1),
                damage_marked: 0,
            },
        ]);
        let targets = legal_attack_targets(actor, AttackerRef::Ally { index: 1 }, &opponent);
        assert_eq!(targets, vec![AttackTarget::Ally { index: 0 }]);
    }

    #[test]
    fn stealth_taunt_not_able_without_true_sight() {
        let actor = base_actor();
        let opponent = opponent_with(vec![
            OpponentAllyView {
                index: 0,
                card: "stealth_taunt".into(),
                awake: true,
                stealth: true,
                taunt: true,
                power: 2,
                life: Some(3),
                damage_marked: 0,
            },
            OpponentAllyView {
                index: 1,
                card: Card::ClumsyApprentice.id().to_string(),
                awake: true,
                stealth: false,
                taunt: false,
                power: 1,
                life: Some(1),
                damage_marked: 0,
            },
        ]);
        let targets = legal_attack_targets(actor, AttackerRef::Ally { index: 0 }, &opponent);
        assert_eq!(
            targets,
            vec![
                AttackTarget::Champion,
                AttackTarget::Ally { index: 1 },
            ]
        );
    }

    #[test]
    fn mark_ally_damage_destroys_at_life() {
        let mut state = State::with_queue(&[], true, 3, &[]);
        state.add_ally(Card::ClumsyApprentice, true, false);
        assert_eq!(Card::ClumsyApprentice.life(), Some(1));
        assert!(state.mark_ally_damage(0, 1));
        assert_eq!(state.ally_len, 0);
    }

    #[test]
    fn mark_ally_damage_respects_immortal() {
        let mut state = State::with_queue(&[], true, 3, &[]);
        state.add_ally(Card::ClumsyApprentice, true, true);
        assert!(!state.mark_ally_damage(0, 5));
        assert_eq!(state.ally_len, 1);
        assert_eq!(state.allies[0].damage_marked(), 5);
    }

    #[test]
    fn from_state_includes_granted_stealth() {
        let mut state = State::with_queue(&[], true, 3, &[]);
        state.add_ally(Card::ClumsyApprentice, true, false);
        state.allies[0].set_stealth(true);
        let view = OpponentView::from_state(state, 15);
        assert!(view.allies[0].stealth);
    }
}
