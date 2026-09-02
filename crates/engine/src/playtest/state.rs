//! Playtest engine-state serialization and zone views.

use crate::cards::{ALL_CARDS, CARD_COUNT, Card, parse_card};
use crate::error::{EngineError, Result};
use crate::model::{
    Ally, MAT_BLADE, MAT_DAGGER, MAT_HAMMER, MAT_RING, MAT_RIPPER, MAT_SOULKNIFE, MAT_TRISTAN,
    MAT_ZANDER, MAT_ZANDER_2, Phase, State, Weapon,
};
use std::collections::BTreeMap;

use super::types::*;

pub(super) fn parse_hand(hand: &[String]) -> Result<Vec<Card>> {
    hand.iter()
        .map(|id| parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone())))
        .collect()
}

pub(super) fn parse_queue(queue: &[String]) -> Result<Vec<Card>> {
    queue
        .iter()
        .map(|id| parse_card(id).ok_or_else(|| EngineError::UnknownQueueCard(id.clone())))
        .collect()
}

pub(super) fn materials_from_map(materials: &BTreeMap<String, u8>) -> u16 {
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

pub(super) fn state_view(state: State) -> PlaytestStateView {
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

pub(super) fn state_to_engine(state: State) -> PlaytestEngineState {
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

pub(super) fn engine_to_state(engine: &PlaytestEngineState) -> State {
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

pub(super) fn format_attack_others_label(state: State) -> String {
    let allies: Vec<&str> = (0..state.ally_len as usize)
        .filter(|&index| state.allies[index].card() != Card::Arthur && state.can_ally_attack(index))
        .map(|index| state.allies[index].card().short())
        .collect();
    if allies.is_empty() {
        "Attack with non-Arthur allies".to_string()
    } else {
        format!("Attack with {} (not Arthur)", allies.join(" · "))
    }
}

pub(super) fn format_glimpse_layout(state: State, layout: u8) -> String {
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

pub(super) fn parse_weapon(id: &str) -> Result<Weapon> {
    Ok(match id {
        "impact_hammer" => Weapon::ImpactHammer,
        "mercenary_blade" => Weapon::MercenaryBlade,
        "varuckan_soulknife" => Weapon::VaruckanSoulknife,
        "assassins_ripper" => Weapon::AssassinsRipper,
        _ => return Err(EngineError::UnknownCard(id.to_string())),
    })
}

pub(super) fn weapon_id(weapon: Weapon) -> Option<String> {
    weapon.id().map(str::to_string)
}

pub(super) fn parse_reserved(reserved: &[String]) -> Result<Vec<Card>> {
    reserved
        .iter()
        .map(|id| parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone())))
        .collect()
}

pub(crate) fn hand_slots(state: State) -> Vec<Card> {
    state.hand_slots()
}
