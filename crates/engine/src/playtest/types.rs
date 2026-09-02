//! Playtest request/response types shared with the worker.

use crate::line_event::LineEvent;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[cfg(feature = "ts")]
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestInitRequest {
    pub hand: Vec<String>,
    pub go_first: bool,
    pub max_turns: u8,
    #[serde(default)]
    pub materials: BTreeMap<String, u8>,
    #[serde(default)]
    pub queue: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestInitResult {
    pub state: PlaytestStateView,
    pub events: Vec<LineEvent>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestLegalActionsRequest {
    pub state: PlaytestEngineState,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestLegalActionsResult {
    pub actions: Vec<PlaytestActionOption>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestApplyRequest {
    pub state: PlaytestEngineState,
    pub action: PlaytestAction,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestApplyResult {
    pub state: PlaytestStateView,
    pub events: Vec<LineEvent>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestAllyView {
    pub card: String,
    pub awake: bool,
    pub immortal: bool,
    pub stealth: bool,
    pub attack_buff: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestWeaponView {
    pub card: String,
    pub durability: u8,
    pub power: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestStateView {
    pub engine: PlaytestEngineState,
    pub hand: Vec<String>,
    pub memory: Vec<String>,
    pub allies: Vec<PlaytestAllyView>,
    #[serde(default)]
    pub weapons: Vec<PlaytestWeaponView>,
    #[serde(default)]
    pub gy: BTreeMap<String, u8>,
    #[serde(default)]
    pub banished: BTreeMap<String, u8>,
    #[serde(default)]
    pub ring_banished: bool,
    pub phase: String,
    pub turn: u8,
    pub max_turns: u8,
    pub damage: u8,
    pub fire_gy: u8,
    pub float_gy: u8,
    pub champion_level: u8,
    pub tristan_leveled: bool,
    pub champion_awake: bool,
    pub champion_damaged: bool,
    pub prep: u8,
    pub agility: u8,
    pub dagger: bool,
    pub dagger_ready: bool,
    pub ring: bool,
    pub amplify: bool,
    pub queue_remaining: u8,
    pub terminal: bool,
    #[serde(default)]
    pub glimpse_peek: Vec<String>,
    #[serde(default)]
    pub glimpse_layouts: Vec<PlaytestGlimpseLayout>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestGlimpseLayout {
    pub layout: u8,
    pub label: String,
    pub queue_top: Vec<String>,
}

/// Raw engine board position for round-tripping through apply/legal-actions.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestEngineState {
    pub hand: Vec<u8>,
    pub memory: Vec<u8>,
    pub hand_len: u8,
    pub memory_len: u8,
    pub allies: Vec<u32>,
    pub ally_len: u8,
    pub turn: u8,
    pub max_turns: u8,
    pub phase: u8,
    pub fire_gy: u8,
    pub float_gy: u8,
    pub gy_total: u8,
    pub march_hare_gy: u8,
    pub gy: Vec<u8>,
    pub banished: Vec<u8>,
    #[serde(default)]
    pub banished_total: u8,
    #[serde(default)]
    pub ring_banished: bool,
    pub champion_level: u8,
    pub tristan_leveled: bool,
    pub champion_awake: bool,
    pub champion_damaged: bool,
    pub prep: u8,
    pub agility: u8,
    pub weapons: Vec<u8>,
    pub weapon_power_bonus: u8,
    pub dagger: bool,
    pub dagger_ready: bool,
    pub ring: bool,
    pub amplify: bool,
    pub materials: u16,
    pub hot_cake: u8,
    pub go_first: bool,
    pub queue_pos: u8,
    pub damage: u8,
    pub queue: Vec<u8>,
    pub queue_len: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum PlaytestAction {
    Pass,
    SkipMaterialize,
    MaterializeHammer,
    MaterializeDagger,
    MaterializeZanderMemory {
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            alias = "glimpse_layout"
        )]
        glimpse_layout: Option<u8>,
    },
    MaterializeTristanMemory,
    TristanRecollect,
    SkipAgility,
    MaterializeSoulknife,
    MaterializeRipper,
    MaterializeRing,
    ActivateDagger,
    ActivateRipper,
    ActivateSadi {
        index: u8,
    },
    AttackArthur {
        index: u8,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        skip_discard: Option<bool>,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            rename = "discardHandIndex",
            alias = "discard_hand_index"
        )]
        discard_hand_index: Option<u8>,
        #[serde(
            default,
            skip_serializing_if = "Vec::is_empty",
            rename = "discardHandIndices",
            alias = "discard_hand_indices"
        )]
        discard_hand_indices: Vec<Option<u8>>,
    },
    AttackOthers {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        skip_discard: Option<bool>,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            rename = "discardHandIndex",
            alias = "discard_hand_index"
        )]
        discard_hand_index: Option<u8>,
        #[serde(
            default,
            skip_serializing_if = "Vec::is_empty",
            rename = "discardHandIndices",
            alias = "discard_hand_indices"
        )]
        discard_hand_indices: Vec<Option<u8>>,
    },
    PlayAlly {
        card: String,
        kindle: u8,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sacrifice_ally: Option<u8>,
        hot_cake_sacrifice: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        flagrant_level: Option<u16>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        flagrant_gy_return: Option<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        reserved: Vec<String>,
        #[serde(
            default,
            skip_serializing_if = "Vec::is_empty",
            rename = "reservedHandIndices",
            alias = "reserved_hand_indices"
        )]
        reserved_hand_indices: Vec<u8>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        skip_discard: Option<bool>,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            rename = "discardHandIndex",
            alias = "discard_hand_index"
        )]
        discard_hand_index: Option<u8>,
    },
    PlayItem {
        card: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        reserved: Vec<String>,
        #[serde(
            default,
            skip_serializing_if = "Vec::is_empty",
            rename = "reservedHandIndices",
            alias = "reserved_hand_indices"
        )]
        reserved_hand_indices: Vec<u8>,
    },
    PlayAttack {
        card: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        wield: Option<String>,
        prepared: bool,
        doubled: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        command_ally: Option<u8>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        reserved: Vec<String>,
        #[serde(
            default,
            skip_serializing_if = "Vec::is_empty",
            rename = "reservedHandIndices",
            alias = "reserved_hand_indices"
        )]
        reserved_hand_indices: Vec<u8>,
    },
    PlayAction {
        card: String,
        kindle: u8,
        prepared: bool,
        imbue: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        sacrifice_ally: Option<u8>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        reserved: Vec<String>,
        #[serde(
            default,
            skip_serializing_if = "Vec::is_empty",
            rename = "reservedHandIndices",
            alias = "reserved_hand_indices"
        )]
        reserved_hand_indices: Vec<u8>,
    },
    ActivateArsonist {
        index: u8,
    },
    BlazingThrow {
        weapon: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        reserved: Vec<String>,
        #[serde(
            default,
            skip_serializing_if = "Vec::is_empty",
            rename = "reservedHandIndices",
            alias = "reserved_hand_indices"
        )]
        reserved_hand_indices: Vec<u8>,
    },
    MercenaryBlade,
    BanishCrusaderRing,
    AttackWithWeapon {
        weapon: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestDiscardStep {
    pub label: String,
    pub discard_optional: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discard_hand: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drawn_discard_index: Option<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PlaytestActionOption {
    pub action: PlaytestAction,
    pub label: String,
    pub reserve_count: u8,
    pub fire_only: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub played_card: Option<String>,
    pub discard_optional: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discard_hand: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drawn_discard_index: Option<u8>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discard_steps: Vec<PlaytestDiscardStep>,
}
