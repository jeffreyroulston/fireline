//! Interactive step-by-step playtest API for manual line exploration.

use crate::cards::{ALL_CARDS, CARD_COUNT, Card, parse_card};
use crate::error::{EngineError, Result};
use crate::line_event::{EventTape, LineEvent};
use crate::model::{
    Action, Ally, Phase, State, Weapon, MAT_BLADE, MAT_DAGGER, MAT_HAMMER, MAT_RING, MAT_RIPPER,
    MAT_SOULKNIFE, MAT_TRISTAN, MAT_ZANDER, MAT_ZANDER_2,
};
use crate::solver::{
    action_discard_hand, action_discard_required, apply_action_with_payment,
    action_payment_required, legal_actions, ActionPayment, DiscardPayment, PaymentRequirement,
};
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
            rename = "discardHandIndex"
        )]
        discard_hand_index: Option<u8>,
    },
    AttackOthers {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        skip_discard: Option<bool>,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            rename = "discardHandIndex"
        )]
        discard_hand_index: Option<u8>,
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
            rename = "reservedHandIndices"
        )]
        reserved_hand_indices: Vec<u8>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        skip_discard: Option<bool>,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            rename = "discardHandIndex"
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
            rename = "reservedHandIndices"
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
            rename = "reservedHandIndices"
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
            rename = "reservedHandIndices"
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
            rename = "reservedHandIndices"
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
}

pub fn playtest_init(request: &PlaytestInitRequest) -> Result<PlaytestInitResult> {
    let hand = parse_hand(&request.hand)?;
    let queue = parse_queue(&request.queue)?;
    let materials = materials_from_map(&request.materials);
    let mut state = State::with_queue_and_materials(
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

pub fn playtest_legal_actions(request: &PlaytestLegalActionsRequest) -> Result<PlaytestLegalActionsResult> {
    let state = engine_to_state(&request.state);
    let actions = legal_actions(state)
        .into_iter()
        .map(|action| {
            let payment = action_payment_required(state, action);
            let discard = action_discard_required(state, action);
            let discard_hand_view = action_discard_hand(state, action);
            PlaytestActionOption {
                action: action_to_playtest(action),
                label: format_action(state, action),
                reserve_count: payment.map(|req| req.reserve).unwrap_or(0),
                fire_only: payment.map(|req| req.fire_only).unwrap_or(false),
                played_card: payment
                    .and_then(|req| req.played_card)
                    .map(|card| card.id().to_string()),
                discard_optional: discard.map(|req| req.optional).unwrap_or(false),
                discard_hand: discard_hand_view
                    .as_ref()
                    .map(|(slots, _)| slots.iter().map(|card| card.id().to_string()).collect())
                    .unwrap_or_default(),
                drawn_discard_index: discard_hand_view.and_then(|(_, index)| index),
            }
        })
        .collect();
    Ok(PlaytestLegalActionsResult { actions })
}

pub fn playtest_apply(request: &PlaytestApplyRequest) -> Result<PlaytestApplyResult> {
    let state = engine_to_state(&request.state);
    let action = playtest_to_action(&request.action)?;
    let payment = payment_from_playtest_action(&request.action, state, action)?;
    let (next, events) = apply_action_with_payment(state, action, payment);
    Ok(PlaytestApplyResult {
        state: state_view(next),
        events,
    })
}

fn parse_hand(hand: &[String]) -> Result<Vec<Card>> {
    hand.iter()
        .map(|id| parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone())))
        .collect()
}

fn parse_queue(queue: &[String]) -> Result<Vec<Card>> {
    queue
        .iter()
        .map(|id| parse_card(id).ok_or_else(|| EngineError::UnknownQueueCard(id.clone())))
        .collect()
}

fn materials_from_map(materials: &BTreeMap<String, u8>) -> u16 {
    if materials.is_empty() {
        return crate::model::ALL_MATERIALS;
    }
    let mut mask = 0_u16;
    for (id, count) in materials {
        if *count == 0 {
            continue;
        }
        mask |= match id.as_str() {
            "impact_hammer" => MAT_HAMMER,
            "mercenary_blade" => MAT_BLADE,
            "poisoned_dagger" => MAT_DAGGER,
            "zander_1" => MAT_ZANDER,
            "zander_2" => MAT_ZANDER_2,
            "varuckan_soulknife" => MAT_SOULKNIFE,
            "tristan_1" => MAT_TRISTAN,
            "assassins_ripper" => MAT_RIPPER,
            "grand_crusaders_ring" => MAT_RING,
            _ => continue,
        };
    }
    if mask == 0 {
        crate::model::ALL_MATERIALS
    } else {
        mask
    }
}

fn state_view(state: State) -> PlaytestStateView {
    let engine = state_to_engine(state);
    let (glimpse_peek, glimpse_layouts) = glimpse_views(state);
    PlaytestStateView {
        hand: expand_zone(&engine.hand),
        memory: expand_zone(&engine.memory),
        allies: (0..engine.ally_len as usize)
            .map(|index| ally_view(Ally::from_raw(engine.allies[index])))
            .collect(),
        weapons: weapon_views(state),
        gy: gy_map(&engine.gy),
        banished: gy_map(&engine.banished),
        ring_banished: engine.ring_banished,
        phase: phase_name(engine.phase),
        turn: engine.turn,
        max_turns: engine.max_turns,
        damage: engine.damage,
        fire_gy: engine.fire_gy,
        float_gy: engine.float_gy,
        champion_level: engine.champion_level,
        tristan_leveled: engine.tristan_leveled,
        champion_awake: engine.champion_awake,
        champion_damaged: engine.champion_damaged,
        prep: engine.prep,
        agility: engine.agility,
        dagger: engine.dagger,
        dagger_ready: engine.dagger_ready,
        ring: engine.ring,
        amplify: engine.amplify,
        queue_remaining: engine.queue_len.saturating_sub(engine.queue_pos),
        terminal: state.is_terminal(),
        glimpse_peek,
        glimpse_layouts,
        engine,
    }
}

fn state_to_engine(state: State) -> PlaytestEngineState {
    PlaytestEngineState {
        hand: state.hand.to_vec(),
        memory: state.memory.to_vec(),
        hand_len: state.hand_len,
        memory_len: state.memory_len,
        allies: state.allies.iter().map(|ally| ally.raw()).collect(),
        ally_len: state.ally_len,
        turn: state.turn,
        max_turns: state.max_turns,
        phase: state.phase as u8,
        fire_gy: state.fire_gy,
        float_gy: state.float_gy,
        gy_total: state.gy_total,
        march_hare_gy: state.march_hare_gy,
        gy: state.gy.to_vec(),
        banished: state.banished.to_vec(),
        banished_total: state.banished_total,
        ring_banished: state.ring_banished,
        champion_level: state.champion_level,
        tristan_leveled: state.tristan_leveled,
        champion_awake: state.champion_awake,
        champion_damaged: state.champion_damaged,
        prep: state.prep,
        agility: state.agility,
        weapons: state.weapons.to_vec(),
        weapon_power_bonus: state.weapon_power_bonus,
        dagger: state.dagger,
        dagger_ready: state.dagger_ready,
        ring: state.ring,
        amplify: state.amplify,
        materials: state.materials,
        hot_cake: state.hot_cake,
        go_first: state.go_first,
        queue_pos: state.queue_pos,
        damage: state.damage,
        queue: state.queue.to_vec(),
        queue_len: state.queue_len,
    }
}

fn fixed_array<const N: usize>(slice: &[u8]) -> [u8; N] {
    let mut out = [0_u8; N];
    let len = slice.len().min(N);
    out[..len].copy_from_slice(&slice[..len]);
    out
}

fn engine_to_state(engine: &PlaytestEngineState) -> State {
    let mut allies = [Ally::default(); 10];
    for (index, raw) in engine.allies.iter().take(10).enumerate() {
        allies[index] = Ally::from_raw(*raw);
    }
    State {
        hand: fixed_array::<CARD_COUNT>(&engine.hand),
        memory: fixed_array::<CARD_COUNT>(&engine.memory),
        hand_len: engine.hand_len,
        memory_len: engine.memory_len,
        allies,
        ally_len: engine.ally_len,
        turn: engine.turn,
        max_turns: engine.max_turns,
        phase: match engine.phase {
            1 => Phase::Materialize,
            2 => Phase::Agility,
            _ => Phase::Main,
        },
        fire_gy: engine.fire_gy,
        float_gy: engine.float_gy,
        gy_total: engine.gy_total,
        march_hare_gy: engine.march_hare_gy,
        gy: fixed_array::<CARD_COUNT>(&engine.gy),
        banished: fixed_array::<CARD_COUNT>(&engine.banished),
        banished_total: engine.banished_total,
        ring_banished: engine.ring_banished,
        champion_level: engine.champion_level,
        tristan_leveled: engine.tristan_leveled,
        champion_awake: engine.champion_awake,
        champion_damaged: engine.champion_damaged,
        prep: engine.prep,
        agility: engine.agility,
        weapons: fixed_array::<4>(&engine.weapons),
        weapon_power_bonus: engine.weapon_power_bonus,
        dagger: engine.dagger,
        dagger_ready: engine.dagger_ready,
        ring: engine.ring,
        amplify: engine.amplify,
        materials: engine.materials,
        hot_cake: engine.hot_cake,
        go_first: engine.go_first,
        queue_pos: engine.queue_pos,
        damage: engine.damage,
        queue: fixed_array::<64>(&engine.queue),
        queue_len: engine.queue_len,
    }
}

fn expand_zone(counts: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    for card in ALL_CARDS {
        let copies = counts.get(card.index()).copied().unwrap_or(0);
        for _ in 0..copies {
            out.push(card.id().to_string());
        }
    }
    out
}

fn gy_map(gy: &[u8]) -> BTreeMap<String, u8> {
    let mut out = BTreeMap::new();
    for card in ALL_CARDS {
        let count = gy[card.index()];
        if count > 0 {
            out.insert(card.id().to_string(), count);
        }
    }
    out
}

fn glimpse_views(state: State) -> (Vec<String>, Vec<PlaytestGlimpseLayout>) {
    let peek: Vec<String> = state
        .glimpse_peek()
        .into_iter()
        .map(|card| card.id().to_string())
        .collect();
    if peek.is_empty() {
        return (peek, Vec::new());
    }
    let layouts = state
        .glimpse_playtest_layouts()
        .into_iter()
        .map(|layout| glimpse_layout_view(state, layout))
        .collect();
    (peek, layouts)
}

fn glimpse_layout_view(state: State, layout: u8) -> PlaytestGlimpseLayout {
    let mut reordered = state;
    reordered.apply_glimpse_layout(layout);
    let pos = reordered.queue_pos as usize;
    let len = reordered.queue_len as usize;
    let top_n = len.saturating_sub(pos).min(2);
    let queue_top: Vec<String> = reordered.queue[pos..pos + top_n]
        .iter()
        .map(|&raw| ALL_CARDS[raw as usize].id().to_string())
        .collect();
    PlaytestGlimpseLayout {
        layout,
        label: format_glimpse_layout(state, layout),
        queue_top,
    }
}

fn format_attack_others_label(state: State) -> String {
    let allies: Vec<&str> = (0..state.ally_len as usize)
        .filter(|&index| {
            state.allies[index].card() != Card::Arthur && state.can_ally_attack(index)
        })
        .map(|index| state.allies[index].card().short())
        .collect();
    if allies.is_empty() {
        "Attack with non-Arthur allies".to_string()
    } else {
        format!("Attack with {} (not Arthur)", allies.join(" · "))
    }
}

fn format_glimpse_layout(state: State, layout: u8) -> String {
    let peek: Vec<&str> = state
        .glimpse_peek()
        .iter()
        .map(|card| card.short())
        .collect();
    match peek.len() {
        0 => format!("Layout {layout}"),
        1 => {
            let name = peek[0];
            if layout == 1 {
                format!("{name} to bottom")
            } else {
                format!("{name} to top")
            }
        }
        _ => {
            let first = peek[0];
            let second = peek[1];
            match layout {
                0 => format!("{first} to top, {second} to top"),
                1 => format!("{second} to top, {first} to top"),
                2 => format!("{first} to top, {second} to bottom"),
                3 => format!("{second} to top, {first} to bottom"),
                4 => "Both to bottom".to_string(),
                _ => format!("Layout {layout}"),
            }
        }
    }
}

fn ally_view(ally: Ally) -> PlaytestAllyView {
    PlaytestAllyView {
        card: ally.card().id().to_string(),
        awake: ally.awake(),
        immortal: ally.immortal(),
        stealth: ally.stealth(),
        attack_buff: ally.attack_buff(),
    }
}

fn weapon_views(state: State) -> Vec<PlaytestWeaponView> {
    Weapon::EQUIPPABLE
        .iter()
        .filter_map(|&weapon| {
            let durability = state.weapon_durability(weapon);
            if durability == 0 {
                return None;
            }
            Some(PlaytestWeaponView {
                card: weapon_id(weapon)?,
                durability,
                power: state.weapon_power(weapon),
            })
        })
        .collect()
}

fn phase_name(phase: u8) -> String {
    match phase {
        1 => "materialize".to_string(),
        2 => "agility".to_string(),
        _ => "main".to_string(),
    }
}

fn parse_weapon(id: &str) -> Result<Weapon> {
    Ok(match id {
        "impact_hammer" => Weapon::ImpactHammer,
        "mercenary_blade" => Weapon::MercenaryBlade,
        "varuckan_soulknife" => Weapon::VaruckanSoulknife,
        "assassins_ripper" => Weapon::AssassinsRipper,
        _ => return Err(EngineError::UnknownCard(id.to_string())),
    })
}

fn weapon_id(weapon: Weapon) -> Option<String> {
    weapon.id().map(str::to_string)
}

fn parse_reserved(reserved: &[String]) -> Result<Vec<Card>> {
    reserved
        .iter()
        .map(|id| parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone())))
        .collect()
}

fn hand_slots(state: State) -> Vec<Card> {
    state.hand_slots()
}

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
                Err(EngineError::invalid(
                    if req.optional {
                        "Select a card to discard or skip the discard effect."
                    } else {
                        "Select a card to discard."
                    },
                ))
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

fn reserved_from_action(action: &PlaytestAction) -> (&[String], &[u8]) {
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

fn payment_from_playtest_action(
    action: &PlaytestAction,
    state: State,
    engine_action: Action,
) -> Result<Option<ActionPayment>> {
    let reserve_requirement = action_payment_required(state, engine_action);
    let discard_requirement = action_discard_required(state, engine_action);
    let needs_reserve = reserve_requirement
        .map(|req| req.reserve > 0)
        .unwrap_or(false);
    let needs_discard = discard_requirement.is_some();

    let reserved = if needs_reserve {
        let requirement = reserve_requirement.expect("reserve requirement");
        resolve_reserved_cards(action, state, requirement)?
    } else {
        Vec::new()
    };

    let discard = discard_payment_from_action(
        action,
        state,
        engine_action,
        discard_requirement,
        reserve_requirement,
    )?;

    if !needs_reserve && !needs_discard {
        return Ok(None);
    }

    Ok(Some(ActionPayment { reserved, discard }))
}

fn playtest_to_action(action: &PlaytestAction) -> Result<Action> {
    Ok(match action {
        PlaytestAction::Pass => Action::Pass,
        PlaytestAction::SkipMaterialize => Action::SkipMaterialize,
        PlaytestAction::MaterializeHammer => Action::MaterializeHammer,
        PlaytestAction::MaterializeDagger => Action::MaterializeDagger,
        PlaytestAction::MaterializeZanderMemory { glimpse_layout } => {
            Action::MaterializeZanderMemory {
                glimpse_layout: *glimpse_layout,
            }
        }
        PlaytestAction::MaterializeTristanMemory => Action::MaterializeTristanMemory,
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
            wield: wield
                .as_ref()
                .map(|id| parse_weapon(id))
                .transpose()?,
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
        PlaytestAction::BlazingThrow { weapon, .. } => {
            Action::BlazingThrow(parse_weapon(weapon)?)
        }
        PlaytestAction::MercenaryBlade => Action::MercenaryBlade,
        PlaytestAction::BanishCrusaderRing => Action::BanishCrusaderRing,
        PlaytestAction::AttackWithWeapon { weapon } => {
            Action::AttackWithWeapon(parse_weapon(weapon)?)
        }
    })
}

fn action_to_playtest(action: Action) -> PlaytestAction {
    match action {
        Action::Pass => PlaytestAction::Pass,
        Action::SkipMaterialize => PlaytestAction::SkipMaterialize,
        Action::MaterializeHammer => PlaytestAction::MaterializeHammer,
        Action::MaterializeDagger => PlaytestAction::MaterializeDagger,
        Action::MaterializeZanderMemory { glimpse_layout } => PlaytestAction::MaterializeZanderMemory {
            glimpse_layout,
        },
        Action::MaterializeTristanMemory => PlaytestAction::MaterializeTristanMemory,
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
        },
        Action::AttackOthers => PlaytestAction::AttackOthers {
            skip_discard: None,
            discard_hand_index: None,
        },
        Action::PlayAlly {
            card,
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return,
        } => PlaytestAction::PlayAlly {
            card: card.id().to_string(),
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return: flagrant_gy_return.map(|c| c.id().to_string()),
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

fn format_action(state: State, action: Action) -> String {
    match action {
        Action::Pass => "Pass".to_string(),
        Action::SkipMaterialize => "Skip Materialize".to_string(),
        Action::MaterializeHammer => "Materialize Impact Hammer".to_string(),
        Action::MaterializeDagger => "Materialize Poisoned Dagger".to_string(),
        Action::MaterializeZanderMemory { glimpse_layout } => match glimpse_layout {
            Some(layout) => format!("Materialize Zander · {}", format_glimpse_layout(state, layout)),
            None => "Materialize Zander".to_string(),
        },
        Action::MaterializeTristanMemory => "Materialize Tristan".to_string(),
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
                parts.push(format!("Flagrant {level}"));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::Card;

    #[test]
    fn playtest_init_going_second_draws_from_queue() {
        let result = playtest_init(&PlaytestInitRequest {
            hand: vec!["arthur".to_string(), "ignited_stab".to_string()],
            go_first: false,
            max_turns: 2,
            materials: BTreeMap::new(),
            queue: vec!["hasty_messenger".to_string()],
        })
        .expect("init");
        assert_eq!(result.events.len(), 1);
        assert_eq!(result.events[0].drawn.as_deref(), Some("hasty_messenger"));
        assert_eq!(result.state.queue_remaining, 0);
        assert!(!result.state.terminal);
    }

    #[test]
    fn playtest_apply_pass_advances_phase() {
        let init = playtest_init(&PlaytestInitRequest {
            hand: vec![
                "arthur".to_string(),
                "ignited_stab".to_string(),
                Card::Brick.id().to_string(),
            ],
            go_first: true,
            max_turns: 2,
            materials: BTreeMap::new(),
            queue: vec![],
        })
        .expect("init");
        let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
            state: init.state.engine.clone(),
        })
        .expect("legal");
        assert!(legal.actions.iter().any(|opt| matches!(opt.action, PlaytestAction::Pass)));
        let start_phase = init.state.phase.clone();
        let applied = playtest_apply(&PlaytestApplyRequest {
            state: init.state.engine,
            action: PlaytestAction::Pass,
        })
        .expect("apply");
        assert!(applied.events.iter().any(|event| event.op.as_str() == "pass"));
        assert_ne!(applied.state.phase, start_phase);
    }

    #[test]
    fn playtest_apply_play_ally_with_manual_reserve_indices() {
        let init = playtest_init(&PlaytestInitRequest {
            hand: vec![
                Card::PackageCourier.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
                Card::IgnitedStab.id().to_string(),
            ],
            go_first: true,
            max_turns: 1,
            materials: BTreeMap::new(),
            queue: vec![],
        })
        .expect("init");
        let mut engine = init.state.engine.clone();
        engine.turn = 1;
        let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
            state: engine.clone(),
        })
        .expect("legal");
        let courier = legal
            .actions
            .iter()
            .find(|opt| {
                matches!(
                    &opt.action,
                    PlaytestAction::PlayAlly { card, kindle, .. }
                        if card == Card::PackageCourier.id() && *kindle == 0
                )
            })
            .expect("play courier without kindle");
        assert_eq!(courier.reserve_count, 2);

        let mut action = courier.action.clone();
        if let PlaytestAction::PlayAlly {
            reserved_hand_indices,
            skip_discard,
            ..
        } = &mut action
        {
            *reserved_hand_indices = vec![1, 2];
            *skip_discard = Some(true);
        } else {
            panic!("expected play ally");
        }

        let applied = playtest_apply(&PlaytestApplyRequest {
            state: engine,
            action,
        })
        .expect("apply with reserve");
        assert_eq!(applied.state.memory.len(), 2);
        assert!(applied.state.memory.iter().all(|id| id == Card::Brick.id()));
        assert_eq!(applied.state.allies.len(), 1);
    }

    #[test]
    fn playtest_apply_vermilion_manual_fire_reserve_imbues_and_draws() {
        let init = playtest_init(&PlaytestInitRequest {
            hand: vec![
                Card::VermilionDecree.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
            ],
            go_first: true,
            max_turns: 1,
            materials: BTreeMap::new(),
            queue: vec![Card::HotCake.id().to_string()],
        })
        .expect("init");
        let mut engine = init.state.engine.clone();
        engine.turn = 1;
        let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
            state: engine.clone(),
        })
        .expect("legal");
        let decree = legal
            .actions
            .iter()
            .find(|opt| {
                matches!(
                    &opt.action,
                    PlaytestAction::PlayAction {
                        card,
                        kindle: 0,
                        imbue: false,
                        ..
                    } if card == Card::VermilionDecree.id()
                )
            })
            .expect("play vermilion without explicit imbue flag");

        let mut action = decree.action.clone();
        if let PlaytestAction::PlayAction {
            reserved_hand_indices,
            ..
        } = &mut action
        {
            *reserved_hand_indices = vec![0, 1, 2];
        } else {
            panic!("expected play action");
        }

        let applied = playtest_apply(&PlaytestApplyRequest {
            state: engine,
            action,
        })
        .expect("apply with fire reserve");
        assert!(
            applied
                .events
                .iter()
                .any(|event| event.imbue == Some(true) && event.drawn.is_some()),
            "{:?}",
            applied.events
        );
        assert!(
            applied.state.hand.iter().any(|id| id == Card::HotCake.id()),
            "imbue should draw Hot Cake: {:?}",
            applied.state.hand
        );
    }

    #[test]
    fn playtest_action_deserializes_reserved_hand_indices() {
        let action = PlaytestAction::PlayAlly {
            card: Card::PackageCourier.id().to_string(),
            kindle: 0,
            sacrifice_ally: None,
            hot_cake_sacrifice: false,
            flagrant_level: None,
            flagrant_gy_return: None,
            reserved: Vec::new(),
            reserved_hand_indices: vec![1, 2],
            skip_discard: None,
            discard_hand_index: None,
        };
        let json = serde_json::to_string(&action).expect("serialize");
        let parsed: PlaytestAction = serde_json::from_str(&json).expect("deserialize");
        let (_, indices) = reserved_from_action(&parsed);
        assert_eq!(indices, &[1, 2]);
        assert!(json.contains("reservedHandIndices"));
    }

    #[test]
    fn playtest_apply_rejects_missing_reserve() {
        let init = playtest_init(&PlaytestInitRequest {
            hand: vec![
                Card::PackageCourier.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
            ],
            go_first: true,
            max_turns: 1,
            materials: BTreeMap::new(),
            queue: vec![],
        })
        .expect("init");
        let mut engine = init.state.engine.clone();
        engine.turn = 1;
        let err = playtest_apply(&PlaytestApplyRequest {
            state: engine,
            action: PlaytestAction::PlayAlly {
                card: Card::PackageCourier.id().to_string(),
                kindle: 0,
                sacrifice_ally: None,
                hot_cake_sacrifice: false,
                flagrant_level: None,
                flagrant_gy_return: None,
                reserved: vec![],
                reserved_hand_indices: vec![],
                skip_discard: None,
                discard_hand_index: None,
            },
        })
        .expect_err("missing reserve");
        assert!(err.to_string().contains("Select cards to reserve"));
    }

    #[test]
    fn playtest_apply_package_courier_manual_discard() {
        let init = playtest_init(&PlaytestInitRequest {
            hand: vec![
                Card::PackageCourier.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
                Card::IgnitedStab.id().to_string(),
                Card::SableRemnant.id().to_string(),
            ],
            go_first: true,
            max_turns: 1,
            materials: BTreeMap::new(),
            queue: vec![Card::HotCake.id().to_string()],
        })
        .expect("init");
        let mut engine = init.state.engine.clone();
        engine.turn = 1;
        let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
            state: engine.clone(),
        })
        .expect("legal");
        let courier = legal
            .actions
            .iter()
            .find(|opt| {
                matches!(
                    &opt.action,
                    PlaytestAction::PlayAlly {
                        card,
                        kindle: 0,
                        ..
                    } if card == Card::PackageCourier.id()
                )
            })
            .expect("play package courier");
        assert!(courier.discard_optional);

        let mut action = courier.action.clone();
        if let PlaytestAction::PlayAlly {
            reserved_hand_indices,
            discard_hand_index,
            ..
        } = &mut action
        {
            *reserved_hand_indices = vec![1, 2];
            *discard_hand_index = Some(3);
        } else {
            panic!("expected play ally");
        }

        let applied = playtest_apply(&PlaytestApplyRequest {
            state: engine,
            action,
        })
        .expect("apply courier with manual discard");
        assert!(
            applied.events.iter().any(|event| {
                event.discarded.as_deref() == Some(Card::IgnitedStab.id())
                    && event.drawn.as_deref() == Some(Card::HotCake.id())
            }),
            "{:?}",
            applied.events
        );
    }

    #[test]
    fn playtest_glimpse_offers_all_five_layouts() {
        let mut state = State::with_queue(
            &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
            true,
            3,
            &[Card::RendingFlames, Card::SurgingBolt, Card::Arthur],
        );
        state.phase = Phase::Materialize;
        state.turn = 2;
        state.materials = MAT_ZANDER;
        state.memory_len = 1;
        assert_eq!(state.draw_potential(), 1);

        let engine = state_to_engine(state);
        let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
            state: engine.clone(),
        })
        .expect("legal");
        let glimpse_layouts: Vec<u8> = legal
            .actions
            .iter()
            .filter_map(|opt| match &opt.action {
                PlaytestAction::MaterializeZanderMemory {
                    glimpse_layout: Some(layout),
                } => Some(*layout),
                _ => None,
            })
            .collect();
        assert_eq!(glimpse_layouts, vec![0, 1, 2, 3, 4], "{glimpse_layouts:?}");

        let view = state_view(engine_to_state(&engine));
        assert_eq!(
            view.glimpse_layouts.iter().map(|l| l.layout).collect::<Vec<_>>(),
            vec![0, 1, 2, 3, 4]
        );
    }

    #[test]
    fn playtest_blazing_throw_requires_manual_reserve() {
        let init = playtest_init(&PlaytestInitRequest {
            hand: vec![
                Card::BlazingThrow.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
                Card::Brick.id().to_string(),
            ],
            go_first: true,
            max_turns: 1,
            materials: BTreeMap::new(),
            queue: vec![],
        })
        .expect("init");
        let mut engine = init.state.engine.clone();
        engine.turn = 1;
        engine.weapons = vec![0, 1, 0, 0];

        let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
            state: engine.clone(),
        })
        .expect("legal");
        let blazing = legal
            .actions
            .iter()
            .find(|opt| matches!(&opt.action, PlaytestAction::BlazingThrow { .. }))
            .expect("blazing throw with equipped blade");
        assert_eq!(blazing.reserve_count, 1);
        assert_eq!(blazing.played_card.as_deref(), Some(Card::BlazingThrow.id()));

        let err = playtest_apply(&PlaytestApplyRequest {
            state: engine.clone(),
            action: blazing.action.clone(),
        })
        .expect_err("reserve required");
        assert!(
            err.to_string().contains("Select cards to reserve"),
            "{err}"
        );

        let mut action = blazing.action.clone();
        if let PlaytestAction::BlazingThrow {
            reserved_hand_indices,
            ..
        } = &mut action
        {
            *reserved_hand_indices = vec![1];
        } else {
            panic!("expected blazing throw");
        }

        let applied = playtest_apply(&PlaytestApplyRequest {
            state: engine,
            action,
        })
        .expect("apply with reserve");
        assert_eq!(applied.state.damage, 4);
        assert!(
            applied
                .events
                .iter()
                .any(|event| event.op.as_str() == "blazingThrow"),
            "{:?}",
            applied.events
        );
    }
}
