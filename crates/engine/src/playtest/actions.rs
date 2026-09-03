//! Playtest action conversion and formatting.

use crate::cards::parse_card;
use crate::error::{EngineError, Result};
use crate::model::{Action, MAT_TRISTAN, State};

use super::state::{format_attack_others_label, format_glimpse_layout, parse_weapon, weapon_id};
use super::types::*;

pub(super) fn playtest_to_action(action: &PlaytestAction) -> Result<Action> {
    Ok(match action {
        PlaytestAction::Pass => Action::Pass,
        PlaytestAction::SkipMaterialize => Action::SkipMaterialize,
        PlaytestAction::SkipPreRecollect => Action::SkipPreRecollect,
        PlaytestAction::MaterializeHammer => Action::MaterializeHammer,
        PlaytestAction::MaterializeDagger => Action::MaterializeDagger,
        PlaytestAction::MaterializeZanderMemory { glimpse_layout } => {
            Action::MaterializeZanderMemory {
                glimpse_layout: *glimpse_layout,
            }
        }
        PlaytestAction::MaterializeTristanMemory { agility } => {
            Action::MaterializeTristanMemory { agility: *agility }
        }
        PlaytestAction::TristanRecollect => Action::TristanRecollect,
        PlaytestAction::SkipAgility => Action::SkipAgility,
        PlaytestAction::MaterializeSoulknife => Action::MaterializeSoulknife,
        PlaytestAction::MaterializeRipper => Action::MaterializeRipper,
        PlaytestAction::MaterializeRing => Action::MaterializeRing,
        PlaytestAction::ActivateDagger => Action::ActivateDagger,
        PlaytestAction::ActivateRipper => Action::ActivateRipper,
        PlaytestAction::ActivateSadi { index } => Action::ActivateSadi(*index),
        PlaytestAction::AttackArthur { index, .. } => Action::AttackArthur(*index),
        PlaytestAction::AttackOthers { .. } => Action::AttackOthers,
        PlaytestAction::PlayAlly {
            card,
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return,
            tristan_agility,
            ..
        } => Action::PlayAlly {
            card: parse_card(card).ok_or_else(|| EngineError::UnknownCard(card.clone()))?,
            kindle: *kindle,
            sacrifice_ally: *sacrifice_ally,
            hot_cake_sacrifice: *hot_cake_sacrifice,
            flagrant_level: *flagrant_level,
            flagrant_gy_return: flagrant_gy_return
                .as_ref()
                .map(|id| parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone())))
                .transpose()?,
            tristan_agility: *tristan_agility,
        },
        PlaytestAction::PlayItem { card, .. } => Action::PlayItem {
            card: parse_card(card).ok_or_else(|| EngineError::UnknownCard(card.clone()))?,
        },
        PlaytestAction::PlayAttack {
            card,
            wield,
            prepared,
            doubled,
            command_ally,
            ..
        } => Action::PlayAttack {
            card: parse_card(card).ok_or_else(|| EngineError::UnknownCard(card.clone()))?,
            wield: wield.as_ref().map(|id| parse_weapon(id)).transpose()?,
            prepared: *prepared,
            doubled: *doubled,
            command_ally: *command_ally,
        },
        PlaytestAction::PlayAction {
            card,
            kindle,
            prepared,
            imbue,
            sacrifice_ally,
            ..
        } => Action::PlayAction {
            card: parse_card(card).ok_or_else(|| EngineError::UnknownCard(card.clone()))?,
            kindle: *kindle,
            prepared: *prepared,
            imbue: *imbue,
            sacrifice_ally: *sacrifice_ally,
        },
        PlaytestAction::ActivateArsonist { index } => Action::ActivateArsonist(*index),
        PlaytestAction::BlazingThrow { weapon, .. } => Action::BlazingThrow(parse_weapon(weapon)?),
        PlaytestAction::MercenaryBlade => Action::MercenaryBlade,
        PlaytestAction::BanishCrusaderRing => Action::BanishCrusaderRing,
        PlaytestAction::AttackWithWeapon { weapon } => {
            Action::AttackWithWeapon(parse_weapon(weapon)?)
        }
    })
}

pub(super) fn action_to_playtest(action: Action) -> PlaytestAction {
    match action {
        Action::Pass => PlaytestAction::Pass,
        Action::SkipMaterialize => PlaytestAction::SkipMaterialize,
        Action::SkipPreRecollect => PlaytestAction::SkipPreRecollect,
        Action::MaterializeHammer => PlaytestAction::MaterializeHammer,
        Action::MaterializeDagger => PlaytestAction::MaterializeDagger,
        Action::MaterializeZanderMemory { glimpse_layout } => {
            PlaytestAction::MaterializeZanderMemory { glimpse_layout }
        }
        Action::MaterializeTristanMemory { agility } => {
            PlaytestAction::MaterializeTristanMemory { agility }
        }
        Action::TristanRecollect => PlaytestAction::TristanRecollect,
        Action::SkipAgility => PlaytestAction::SkipAgility,
        Action::MaterializeSoulknife => PlaytestAction::MaterializeSoulknife,
        Action::MaterializeRipper => PlaytestAction::MaterializeRipper,
        Action::MaterializeRing => PlaytestAction::MaterializeRing,
        Action::ActivateDagger => PlaytestAction::ActivateDagger,
        Action::ActivateRipper => PlaytestAction::ActivateRipper,
        Action::ActivateSadi(index) => PlaytestAction::ActivateSadi { index },
        Action::AttackArthur(index) => PlaytestAction::AttackArthur {
            index,
            skip_discard: None,
            discard_hand_index: None,
            discard_hand_indices: Vec::new(),
        },
        Action::AttackOthers => PlaytestAction::AttackOthers {
            skip_discard: None,
            discard_hand_index: None,
            discard_hand_indices: Vec::new(),
        },
        Action::PlayAlly {
            card,
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return,
            tristan_agility,
        } => PlaytestAction::PlayAlly {
            card: card.id().to_string(),
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return: flagrant_gy_return.map(|c| c.id().to_string()),
            tristan_agility,
            reserved: Vec::new(),
            reserved_hand_indices: Vec::new(),
            skip_discard: None,
            discard_hand_index: None,
        },
        Action::PlayItem { card } => PlaytestAction::PlayItem {
            card: card.id().to_string(),
            reserved: Vec::new(),
            reserved_hand_indices: Vec::new(),
        },
        Action::PlayAttack {
            card,
            wield,
            prepared,
            doubled,
            command_ally,
        } => PlaytestAction::PlayAttack {
            card: card.id().to_string(),
            wield: wield.and_then(weapon_id),
            prepared,
            doubled,
            command_ally,
            reserved: Vec::new(),
            reserved_hand_indices: Vec::new(),
        },
        Action::PlayAction {
            card,
            kindle,
            prepared,
            imbue,
            sacrifice_ally,
        } => PlaytestAction::PlayAction {
            card: card.id().to_string(),
            kindle,
            prepared,
            imbue,
            sacrifice_ally,
            reserved: Vec::new(),
            reserved_hand_indices: Vec::new(),
        },
        Action::ActivateArsonist(index) => PlaytestAction::ActivateArsonist { index },
        Action::BlazingThrow(weapon) => PlaytestAction::BlazingThrow {
            weapon: weapon_id(weapon).unwrap_or_default(),
            reserved: Vec::new(),
            reserved_hand_indices: Vec::new(),
        },
        Action::MercenaryBlade => PlaytestAction::MercenaryBlade,
        Action::BanishCrusaderRing => PlaytestAction::BanishCrusaderRing,
        Action::AttackWithWeapon(weapon) => PlaytestAction::AttackWithWeapon {
            weapon: weapon_id(weapon).unwrap_or_default(),
        },
    }
}

pub(super) fn format_action(state: State, action: Action) -> String {
    match action {
        Action::Pass => "Pass".to_string(),
        Action::SkipMaterialize => "Skip Materialize".to_string(),
        Action::SkipPreRecollect => "Recollect".to_string(),
        Action::MaterializeHammer => "Materialize Impact Hammer".to_string(),
        Action::MaterializeDagger => "Materialize Poisoned Dagger".to_string(),
        Action::MaterializeZanderMemory { glimpse_layout } => match glimpse_layout {
            Some(layout) => format!(
                "Materialize Zander · {}",
                format_glimpse_layout(state, layout)
            ),
            None => "Materialize Zander".to_string(),
        },
        Action::MaterializeTristanMemory { agility: false } => {
            "Materialize Tristan (Prep)".to_string()
        }
        Action::MaterializeTristanMemory { agility: true } => {
            "Materialize Tristan (Agility 3)".to_string()
        }
        Action::TristanRecollect => "Tristan Recollect".to_string(),
        Action::SkipAgility => "Skip Agility".to_string(),
        Action::MaterializeSoulknife => "Materialize Varuckan Soulknife".to_string(),
        Action::MaterializeRipper => "Materialize Assassin's Ripper".to_string(),
        Action::MaterializeRing => "Materialize Grand Crusader's Ring".to_string(),
        Action::ActivateDagger => "Activate Poisoned Dagger".to_string(),
        Action::ActivateRipper => "Activate Assassin's Ripper".to_string(),
        Action::ActivateSadi(index) => format!("Activate Sadi (ally {index})"),
        Action::AttackArthur(index) => format!("Attack with Arthur (ally {index})"),
        Action::AttackOthers => format_attack_others_label(state),
        Action::PlayAlly {
            card,
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return,
            tristan_agility,
        } => {
            let mut parts = vec![format!("Play {}", card.name())];
            if kindle > 0 {
                parts.push(format!("Kindle {kindle}"));
            }
            if let Some(index) = sacrifice_ally {
                let victim = if (index as usize) < state.ally_len as usize {
                    state.allies[index as usize].card().name()
                } else {
                    "ally"
                };
                parts.push(format!("Sacrifice {victim}"));
            }
            if hot_cake_sacrifice {
                parts.push("Hot Cake buff".to_string());
            }
            if let Some(level) = flagrant_level {
                if level == MAT_TRISTAN {
                    parts.push(if tristan_agility {
                        "Level Tristan (Agility 3)".to_string()
                    } else {
                        "Level Tristan (Prep)".to_string()
                    });
                } else {
                    parts.push(format!("Flagrant {level}"));
                }
            }
            if let Some(card) = flagrant_gy_return {
                parts.push(format!("Return {}", card.name()));
            }
            parts.join(" · ")
        }
        Action::PlayItem { card } => format!("Play {}", card.name()),
        Action::PlayAttack {
            card,
            wield,
            prepared,
            doubled,
            command_ally,
        } => {
            let mut parts = vec![format!("Attack {}", card.name())];
            if let Some(weapon) = wield {
                parts.push(format!("Wield {}", weapon.name()));
            }
            if prepared {
                parts.push("Prepared".to_string());
            }
            if doubled {
                parts.push("Doubled".to_string());
            }
            if let Some(index) = command_ally {
                parts.push(format!("Command ally {index}"));
            }
            parts.join(" · ")
        }
        Action::PlayAction {
            card,
            kindle,
            prepared,
            imbue,
            sacrifice_ally,
        } => {
            let mut parts = vec![format!("Play {}", card.name())];
            if kindle > 0 {
                parts.push(format!("Kindle {kindle}"));
            }
            if prepared {
                parts.push("Prepared".to_string());
            }
            if imbue {
                parts.push("Imbue".to_string());
            }
            if let Some(index) = sacrifice_ally {
                parts.push(format!("Sacrifice ally {index}"));
            }
            parts.join(" · ")
        }
        Action::ActivateArsonist(index) => format!("Activate Corhazi Arsonist (ally {index})"),
        Action::BlazingThrow(weapon) => format!("Blazing Throw ({})", weapon.name()),
        Action::MercenaryBlade => "Materialize Mercenary's Blade (Prep 1)".to_string(),
        Action::BanishCrusaderRing => "Banish Grand Crusader's Ring".to_string(),
        Action::AttackWithWeapon(weapon) => format!("Attack with {}", weapon.name()),
    }
}
