//! Legal action enumeration and fast-phase pruning.

use crate::cards::{ALL_CARDS, Card};
use crate::line_event::TapePhase;
use crate::model::{
    Action, MAT_BLADE, MAT_DAGGER, MAT_HAMMER, MAT_RING, MAT_RIPPER, MAT_SOULKNIFE, MAT_TRISTAN,
    MAT_ZANDER, MAT_ZANDER_2, Phase, State, Weapon,
};
use rustc_hash::FxHashMap;

use super::RulesMode;
use super::apply::apply_silent;

/// Optimistic damage per influence-reservation (3), as rational 3/1.
const OPT_DMG_PER_RESERVE_NUM: u16 = 3;
const OPT_DMG_PER_RESERVE_DEN: u16 = 1;

pub(crate) fn is_fast_phase(phase: Phase) -> bool {
    matches!(phase, Phase::PreRecollect | Phase::Agility)
}

fn play_action_cards() -> impl Iterator<Item = Card> {
    ALL_CARDS
        .into_iter()
        .filter(|card| card.is_play_action())
}

fn is_pure_draw_card(card: Card) -> bool {
    card.is_pure_draw_action()
}

/// Mate recollects memory before Main; ignore the Mate draw (unknown / not yet taken).
fn board_for_damage_threat_check(mut state: State) -> State {
    if matches!(state.phase, Phase::Materialize | Phase::PreRecollect) && state.memory_len > 0 {
        for card in ALL_CARDS {
            let count = state.memory[card.index()];
            if count == 0 {
                continue;
            }
            state.hand[card.index()] = state.hand[card.index()].saturating_add(count);
            state.memory[card.index()] = 0;
        }
        state.hand_len = state.hand_len.saturating_add(state.memory_len);
        state.memory_len = 0;
    }
    state
}

fn can_afford_action(state: &State, card: Card) -> bool {
    if !state.has(card) {
        return false;
    }
    let cost = action_cost(state, card);
    let max_kindle = card.kindle().min(state.fire_gy).min(cost);
    for kindle in 0..=max_kindle {
        let reserve = cost.saturating_sub(kindle);
        if state.hand_len.saturating_sub(1) >= reserve {
            return true;
        }
    }
    false
}

/// Approximate: board still has a legal positive-damage Main path (no recursive `actions()`).
fn has_positive_damage_main_play(state: State) -> bool {
    let state = board_for_damage_threat_check(state);
    let turn0_first = state.go_first && state.turn == 0;

    if state.dagger && state.dagger_ready {
        return true;
    }

    if !turn0_first {
        for index in 0..state.ally_len as usize {
            if state.can_ally_attack(index) {
                return true;
            }
        }

        if state.champion_awake {
            for card in [
                Card::IgnitedStab,
                Card::RendingFlames,
                Card::HeatedVengeance,
                Card::ViciousSlice,
            ] {
                if state.has(card) && state.hand_len.saturating_sub(1) >= card.cost() {
                    return true;
                }
            }
            for weapon in Weapon::EQUIPPABLE {
                if state.has_weapon(weapon) {
                    return true;
                }
            }
        }

        if state.has(Card::UncannyRealization)
            && state.hand_len.saturating_sub(1) >= Card::UncannyRealization.cost()
        {
            for index in 0..state.ally_len as usize {
                let ally = state.allies[index];
                if ally.card().is_automaton() && ally.awake() {
                    return true;
                }
            }
        }

        if state.has(Card::BlazingThrow) && state.any_weapon() && state.hand_len >= 2 {
            return true;
        }
    }

    for card in ALL_CARDS {
        if card.is_play_action() && card.on_play_deals_damage() && can_afford_action(&state, card) {
            return true;
        }
    }

    // Soft: Truth/prep → Blade → swing counts as a remaining damage path.
    if !turn0_first && state.champion_awake && state.prep > 0 && state.has_material(MAT_BLADE) {
        return true;
    }

    false
}

/// Pay for a pure-draw action without resolving its draws (threat check only).
fn simulate_pure_draw_payment(
    mut state: State,
    card: Card,
    kindle: u8,
    sacrifice_ally: Option<u8>,
) -> Option<State> {
    if let Some(index) = sacrifice_ally
        && index as usize >= state.ally_len as usize
    {
        return None;
    }
    if !state.remove_hand(card) {
        return None;
    }
    if let Some(index) = sacrifice_ally {
        state.remove_ally(index as usize, true)?;
    }
    let cost = action_cost(&state, card);
    if !state.pay_with_kindle(cost, kindle) {
        return None;
    }
    if card == Card::UndeniableTruth {
        state.prep = state.prep.saturating_add(1);
    }
    Some(state)
}

/// Never spend the last playable hand on pure draw on the **final** turn when
/// damage is still legal.
fn refuse_last_hand_pure_draw(before: State, after: State) -> bool {
    // Earlier turns: digging can set up later Mains — do not gate.
    if before.turn.saturating_add(1) < before.max_turns {
        return false;
    }
    // On Death from a Truth sacrifice is damage from the play itself — keep it.
    if after.damage > before.damage {
        return false;
    }
    has_positive_damage_main_play(before) && !has_positive_damage_main_play(after)
}

/// Reserve cost after Class Bonus reductions (Incapacitate costs 2 less while Assassin).
pub(crate) fn action_cost(state: &State, card: Card) -> u8 {
    let cost = card.cost();
    if card == Card::Incapacitate && state.is_assassin() {
        cost.saturating_sub(2)
    } else {
        cost
    }
}

/// Undeniable Truth: additional cost sacrifices an ally, so offer one play per ally.
fn push_undeniable_truth_plays(state: State, mode: RulesMode, result: &mut Vec<Action>) {
    if !state.has(Card::UndeniableTruth) || state.hand_len < 2 {
        return;
    }
    for index in 0..state.ally_len as usize {
        let Some(after) =
            simulate_pure_draw_payment(state, Card::UndeniableTruth, 0, Some(index as u8))
        else {
            continue;
        };
        if matches!(mode, RulesMode::SolverReduced) && refuse_last_hand_pure_draw(state, after) {
            continue;
        }
        result.push(Action::PlayAction {
            card: Card::UndeniableTruth,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: Some(index as u8),
        });
    }
}

fn push_action_plays(state: State, mode: RulesMode, result: &mut Vec<Action>) {
    for card in play_action_cards() {
        if !state.has(card) {
            continue;
        }
        if card == Card::UndeniableTruth {
            push_undeniable_truth_plays(state, mode, result);
            continue;
        }
        let cost = action_cost(&state, card);
        let max_kindle = card.kindle().min(state.fire_gy).min(cost);
        for kindle in 0..=max_kindle {
            let reserve = cost.saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            if is_pure_draw_card(card) {
                let Some(after) = simulate_pure_draw_payment(state, card, kindle, None) else {
                    continue;
                };
                if matches!(mode, RulesMode::SolverReduced)
                    && refuse_last_hand_pure_draw(state, after)
                {
                    continue;
                }
            }
            let can_prepare =
                card.prepare() > 0 && state.prep >= card.prepare() && state.is_assassin();
            let fire_after = if card.is_fire() {
                state.fire_hand_count().saturating_sub(1)
            } else {
                state.fire_hand_count()
            };
            let can_fire_imbue =
                card.imbue() > 0 && reserve >= card.imbue() && fire_after >= reserve;
            let offer_fire_only = can_fire_imbue && state.non_fire_hand_count() > 0;

            let mut push_action = |prepared: bool, imbue: bool| {
                result.push(Action::PlayAction {
                    card,
                    kindle,
                    prepared,
                    imbue,
                    sacrifice_ally: None,
                });
            };

            if can_prepare {
                if offer_fire_only {
                    push_action(true, true);
                }
                push_action(true, false);
            }
            if offer_fire_only {
                push_action(false, true);
            }
            push_action(false, false);
        }
    }
}

fn push_fast_ally_plays(state: State, result: &mut Vec<Action>) {
    for card in ALL_CARDS {
        if !card.is_ally() || !card.is_fast() || !state.has(card) {
            continue;
        }
        let max_kindle = card.kindle().min(state.fire_gy).min(card.cost());
        for kindle in 0..=max_kindle {
            let reserve = card.cost().saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally: None,
                hot_cake_sacrifice: false,
                flagrant_level: None,
                flagrant_gy_return: None,
                tristan_agility: false,
            });
        }
    }
}

fn zander_gy_return_options(state: State) -> Vec<Card> {
    if !state.is_assassin() {
        return Vec::new();
    }
    ALL_CARDS
        .iter()
        .copied()
        .filter(|&card| card.zander_gy_returnable() && state.gy_count(card) > 0)
        .collect()
}

fn flagrant_level_targets(state: State) -> [Option<u16>; 2] {
    let mut targets = [None; 2];
    let mut count = 0;
    if state.champion_level == 0 {
        if state.has_material(MAT_ZANDER) {
            targets[count] = Some(MAT_ZANDER);
            count += 1;
        }
        if !state.tristan_leveled && state.has_material(MAT_TRISTAN) {
            targets[count] = Some(MAT_TRISTAN);
        }
    } else if state.champion_level == 1 && state.has_material(MAT_ZANDER_2) {
        targets[0] = Some(MAT_ZANDER_2);
    }
    targets
}

fn peppered_chef_sacrifice_targets(state: &State) -> impl Iterator<Item = u8> + '_ {
    (0..state.ally_len).filter_map(|index| {
        let index = index as usize;
        if state.allies[index].card() != Card::Arthur {
            Some(index as u8)
        } else {
            None
        }
    })
}

fn push_peppered_chef_plays(state: State, card: Card, kindle: u8, result: &mut Vec<Action>) {
    for index in peppered_chef_sacrifice_targets(&state) {
        let mut hot_cake_options = vec![false];
        if state.hot_cake > 0 {
            hot_cake_options.insert(0, true);
        }
        for hot_cake_sacrifice in hot_cake_options {
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally: Some(index),
                hot_cake_sacrifice,
                flagrant_level: None,
                flagrant_gy_return: None,
                tristan_agility: false,
            });
        }
    }
}

fn flagrant_guide_actions(
    state: State,
    card: Card,
    kindle: u8,
    sacrifice_ally: Option<u8>,
    hot_cake_sacrifice: bool,
) -> Vec<Action> {
    let mut result = Vec::new();
    for mat in flagrant_level_targets(state) {
        let Some(mat) = mat else {
            continue;
        };
        if mat == MAT_ZANDER_2 {
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally,
                hot_cake_sacrifice,
                flagrant_level: Some(mat),
                flagrant_gy_return: None,
                tristan_agility: false,
            });
            for gy_card in zander_gy_return_options(state) {
                result.push(Action::PlayAlly {
                    card,
                    kindle,
                    sacrifice_ally,
                    hot_cake_sacrifice,
                    flagrant_level: Some(mat),
                    flagrant_gy_return: Some(gy_card),
                    tristan_agility: false,
                });
            }
        } else {
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally,
                hot_cake_sacrifice,
                flagrant_level: Some(mat),
                flagrant_gy_return: None,
                tristan_agility: false,
            });
            if mat == MAT_TRISTAN {
                result.push(Action::PlayAlly {
                    card,
                    kindle,
                    sacrifice_ally,
                    hot_cake_sacrifice,
                    flagrant_level: Some(mat),
                    flagrant_gy_return: None,
                    tristan_agility: true,
                });
            }
        }
    }
    result
}

fn push_fast_action_plays(state: State, mode: RulesMode, result: &mut Vec<Action>) {
    for card in play_action_cards() {
        if !card.is_fast() || !state.has(card) {
            continue;
        }
        if card == Card::UndeniableTruth {
            push_undeniable_truth_plays(state, mode, result);
            continue;
        }
        let cost = action_cost(&state, card);
        let max_kindle = card.kindle().min(state.fire_gy).min(cost);
        for kindle in 0..=max_kindle {
            let reserve = cost.saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            let can_prepare =
                card.prepare() > 0 && state.prep >= card.prepare() && state.is_assassin();
            let fire_after = if card.is_fire() {
                state.fire_hand_count().saturating_sub(1)
            } else {
                state.fire_hand_count()
            };
            let can_fire_imbue =
                card.imbue() > 0 && reserve >= card.imbue() && fire_after >= reserve;
            let offer_fire_only = can_fire_imbue && state.non_fire_hand_count() > 0;

            let mut push_action = |prepared: bool, imbue: bool| {
                result.push(Action::PlayAction {
                    card,
                    kindle,
                    prepared,
                    imbue,
                    sacrifice_ally: None,
                });
            };

            if can_prepare {
                if offer_fire_only {
                    push_action(true, true);
                }
                push_action(true, false);
            }
            if offer_fire_only {
                push_action(false, true);
            }
            push_action(false, false);
        }
    }
}

fn push_fast_plays(state: State, mode: RulesMode, result: &mut Vec<Action>) {
    push_fast_ally_plays(state, result);
    push_fast_action_plays(state, mode, result);
}

/// Influence-reservation budget: current influence × Mains left (including now).
pub(crate) fn reservation_budget(state: State) -> u8 {
    let mains = state.max_turns.saturating_sub(state.turn).max(1);
    state.influence().saturating_mul(mains)
}

/// Optimistic remaining damage from a reservation budget at 3 dmg / influence.
pub(crate) fn optimistic_remaining_from_reserve(reserve: u8) -> u8 {
    let scaled = u16::from(reserve) * OPT_DMG_PER_RESERVE_NUM / OPT_DMG_PER_RESERVE_DEN;
    scaled.min(u16::from(u8::MAX)) as u8
}

/// Zero-reserve damage still on the board / sideboard (allies, weapons, dagger).
/// Required so `3 × reservation` stays admissible — board swings are not paid from I.
fn optimistic_free_board_damage(state: State) -> u8 {
    let mains = u16::from(state.max_turns.saturating_sub(state.turn).max(1));
    let mut total = 0_u16;
    for index in 0..state.ally_len as usize {
        let power = u16::from(state.ally_power(state.allies[index]));
        total = total.saturating_add(power.saturating_mul(mains));
    }
    for weapon in Weapon::EQUIPPABLE {
        let dur = u16::from(state.weapon_durability(weapon));
        if dur == 0 {
            continue;
        }
        total = total.saturating_add(dur.saturating_mul(u16::from(state.weapon_power(weapon))));
    }
    if state.dagger {
        // Ready on each wake; 1 damage per remaining Main.
        total = total.saturating_add(mains);
    }
    let sideboard = |weapon: Weapon, mat: u16| {
        if state.has_material(mat) {
            u16::from(weapon.power().saturating_mul(weapon.durability()))
        } else {
            0
        }
    };
    total = total.saturating_add(sideboard(Weapon::ImpactHammer, MAT_HAMMER));
    total = total.saturating_add(sideboard(Weapon::MercenaryBlade, MAT_BLADE));
    total = total.saturating_add(sideboard(Weapon::VaruckanSoulknife, MAT_SOULKNIFE));
    total = total.saturating_add(sideboard(Weapon::AssassinsRipper, MAT_RIPPER));
    // Ripper activate can add +2 power for a swing — pad when Ripper is available.
    if state.has_material(MAT_RIPPER) || state.has_weapon(Weapon::AssassinsRipper) {
        total = total.saturating_add(2);
    }
    total.min(u16::from(u8::MAX)) as u8
}

pub(crate) fn optimistic_remaining_damage(state: State) -> u8 {
    optimistic_remaining_from_reserve(reservation_budget(state))
        .saturating_add(optimistic_free_board_damage(state))
}

/// Memo board key: same contract as `Search::visit` (damage excluded from the key).
fn memo_board_key(mut state: State) -> State {
    state.damage = 0;
    state
}

/// Stable reorder: actions that deal damage this step before dig / setup / pass.
/// Exact search — only changes expansion order (earlier incumbent for future BnB).
pub(crate) fn order_actions_damage_first(state: &State, actions: &mut [Action]) {
    actions.sort_by_key(|action| !action_deals_immediate_damage(state, *action));
}

fn action_deals_immediate_damage(state: &State, action: Action) -> bool {
    match action {
        Action::AttackArthur(_)
        | Action::AttackAlly(_)
        | Action::AttackOthers
        | Action::PlayAttack { .. }
        | Action::AttackWithWeapon(_)
        | Action::BlazingThrow(_)
        | Action::ActivateDagger => true,
        Action::PlayAction {
            card,
            sacrifice_ally,
            ..
        } => {
            if matches!(
                card,
                Card::FieryInterference
                    | Card::IntensifiedPyre
                    | Card::MarkTheTarget
                    | Card::PlantedExplosive
                    | Card::VermilionDecree
                    | Card::Demolition
                    | Card::SurgingBolt
                    | Card::IgniteFate
                    | Card::SmokeOut
                    | Card::SparkAlight
                    | Card::FlurryOfFire
            ) {
                return true;
            }
            if card == Card::UndeniableTruth
                && let Some(index) = sacrifice_ally
                && (index as usize) < state.ally_len as usize
            {
                return state.allies[index as usize].card().on_death_damage() > 0;
            }
            false
        }
        Action::PlayAlly {
            card,
            sacrifice_ally,
            ..
        } => {
            if card == Card::Rococo {
                // On-enter 2 when influence is low after pay; unique replacement also
                // routes through GY (ordering only — over-approx is fine).
                return state.influence() <= 5
                    || state.allies[..state.ally_len as usize]
                        .iter()
                        .any(|ally| ally.card() == Card::Rococo);
            }
            if card == Card::PepperedChef
                && let Some(index) = sacrifice_ally
                && (index as usize) < state.ally_len as usize
            {
                return state.allies[index as usize].card().on_death_damage() > 0;
            }
            if card.is_unique()
                && state.allies[..state.ally_len as usize]
                    .iter()
                    .any(|ally| ally.card() == card)
            {
                return state.allies[..state.ally_len as usize]
                    .iter()
                    .any(|ally| ally.card() == card && ally.card().on_death_damage() > 0);
            }
            false
        }
        _ => false,
    }
}

/// Drop Mate-ending actions that land on the same post-Mate memo key.
/// On collision keep the sibling with higher incoming damage (exact if a future
/// Mate-ender deals damage mid-phase); ties keep the first action.
pub(crate) fn collapse_mate_ending_siblings(state: State, endings: Vec<Action>) -> Vec<Action> {
    if endings.len() <= 1 {
        return endings;
    }
    let mut best: FxHashMap<State, (Action, u8)> =
        FxHashMap::with_capacity_and_hasher(endings.len(), Default::default());
    let mut order: Vec<State> = Vec::with_capacity(endings.len());
    for action in endings {
        let after = apply_silent(state, action);
        let damage = after.damage;
        let key = memo_board_key(after);
        match best.get(&key) {
            Some(&(_, prev_damage)) if damage <= prev_damage => {}
            Some(_) => {
                best.insert(key, (action, damage));
            }
            None => {
                order.push(key);
                best.insert(key, (action, damage));
            }
        }
    }
    order.into_iter().map(|key| best[&key].0).collect()
}

fn actions(state: State, mode: RulesMode, glimpse_enabled: bool) -> Vec<Action> {
    if state.phase == Phase::Agility {
        let mut result = Vec::with_capacity(24);
        if state.tristan_leveled && state.agility >= 3 && state.memory_len > 0 {
            result.push(Action::TristanRecollect);
        }
        push_fast_plays(state, mode, &mut result);
        result.push(Action::SkipAgility);
        return result;
    }

    if state.phase == Phase::Materialize {
        let mut endings = Vec::with_capacity(16);
        // Mercenary's Blade in Mate: champion must already be leveled.
        if state.turn >= 1 {
            if state.has_material(MAT_HAMMER) {
                endings.push(Action::MaterializeHammer);
            }
            if state.is_assassin() && state.prep > 0 && state.has_material(MAT_BLADE) {
                endings.push(Action::MercenaryBlade);
            }
        }
        // Solver reduction: Poisoned Dagger only offered on the first Materialize window.
        let offer_dagger = state.has_material(MAT_DAGGER)
            && (matches!(mode, RulesMode::Full) || state.turn == 1);
        if offer_dagger && state.turn >= 1 {
            endings.push(Action::MaterializeDagger);
        }
        if state.turn >= 1
            && state.champion_level == 0
            && state.has_material(MAT_ZANDER)
            && (state.memory_len > 0 || state.float_gy > 0)
        {
            if glimpse_enabled && state.queue_pos < state.queue_len {
                let layouts = state.glimpse_playtest_layouts();
                if layouts.is_empty() {
                    // No remaining deck draws — Glimpse cannot change outcomes.
                    endings.push(Action::MaterializeZanderMemory {
                        glimpse_layout: None,
                    });
                } else {
                    for layout in layouts {
                        endings.push(Action::MaterializeZanderMemory {
                            glimpse_layout: Some(layout),
                        });
                    }
                }
            } else {
                endings.push(Action::MaterializeZanderMemory {
                    glimpse_layout: None,
                });
            }
        }
        if state.turn >= 1
            && !state.tristan_leveled
            && state.has_material(MAT_TRISTAN)
            && (state.memory_len > 0 || state.float_gy > 0)
        {
            endings.push(Action::MaterializeTristanMemory { agility: false });
            endings.push(Action::MaterializeTristanMemory { agility: true });
        }
        if state.turn >= 1
            && state.is_assassin()
            && state.has_material(MAT_RIPPER)
            && (state.memory_len > 0 || state.float_gy > 0)
        {
            endings.push(Action::MaterializeRipper);
        }
        if state.turn >= 1 && state.has_material(MAT_RING) {
            endings.push(Action::MaterializeRing);
        }
        endings.push(Action::SkipMaterialize);
        let endings = if matches!(mode, RulesMode::SolverReduced) {
            collapse_mate_ending_siblings(state, endings)
        } else {
            endings
        };

        // Preserve prior order: materializes → Skip.
        let mut result = Vec::with_capacity(endings.len().saturating_add(8));
        for action in endings.iter().copied() {
            if !matches!(action, Action::SkipMaterialize) {
                result.push(action);
            }
        }
        if endings
            .iter()
            .any(|action| matches!(action, Action::SkipMaterialize))
        {
            result.push(Action::SkipMaterialize);
        }
        return result;
    }

    if state.phase == Phase::PreRecollect {
        // Safe reduction: activating Poisoned Dagger first always weakly dominates.
        if matches!(mode, RulesMode::SolverReduced) && state.dagger && state.dagger_ready {
            return vec![Action::ActivateDagger];
        }

        let mut result = Vec::with_capacity(24);
        if state.dagger && state.dagger_ready {
            result.push(Action::ActivateDagger);
        }
        push_fast_plays(state, mode, &mut result);
        result.push(Action::SkipPreRecollect);
        return result;
    }

    let mut result = Vec::with_capacity(48);

    for index in 0..state.ally_len as usize {
        if state.allies[index].card() == Card::Sadi && state.hand_len >= 2 {
            result.push(Action::ActivateSadi(index as u8));
        }
    }

    let mut arthur_ready = false;
    for index in 0..state.ally_len as usize {
        if state.allies[index].card() == Card::Arthur && state.can_ally_attack(index) {
            result.push(Action::AttackArthur(index as u8));
            arthur_ready = true;
            if matches!(mode, RulesMode::SolverReduced) {
                break;
            }
        }
    }
    // Safe reduction: never attack other allies while Arthur can still attack.
    let offer_other_ally_attacks = if matches!(mode, RulesMode::SolverReduced) {
        !arthur_ready
    } else {
        true
    };
    if offer_other_ally_attacks {
        if matches!(mode, RulesMode::SolverReduced) {
            if (0..state.ally_len as usize).any(|index| {
                state.allies[index].card() != Card::Arthur && state.can_ally_attack(index)
            }) {
                result.push(Action::AttackOthers);
            }
        } else {
            // Full: one declare per ready non-Arthur ally (no bulk AttackOthers).
            for index in 0..state.ally_len as usize {
                if state.allies[index].card() != Card::Arthur && state.can_ally_attack(index) {
                    result.push(Action::AttackAlly(index as u8));
                }
            }
        }
    }

    for card in ALL_CARDS {
        if !card.is_ally() || !state.has(card) {
            continue;
        }
        let max_kindle = card.kindle().min(state.fire_gy).min(card.cost());
        for kindle in 0..=max_kindle {
            let reserve = card.cost().saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            if card == Card::PepperedChef {
                push_peppered_chef_plays(state, card, kindle, &mut result);
            }
            if state.hot_cake > 0 {
                result.push(Action::PlayAlly {
                    card,
                    kindle,
                    sacrifice_ally: None,
                    hot_cake_sacrifice: true,
                    flagrant_level: None,
                    flagrant_gy_return: None,
                    tristan_agility: false,
                });
            }
            if card == Card::FlagrantGuide {
                result.extend(flagrant_guide_actions(state, card, kindle, None, false));
            }
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice_ally: None,
                hot_cake_sacrifice: false,
                flagrant_level: None,
                flagrant_gy_return: None,
                tristan_agility: false,
            });
        }
    }

    for card in ALL_CARDS {
        if !card.is_item() || !state.has(card) {
            continue;
        }
        if state.hand_len.saturating_sub(1) < card.cost() {
            continue;
        }
        result.push(Action::PlayItem { card });
    }

    if state.champion_awake && !(state.go_first && state.turn == 0) {
        for card in [
            Card::IgnitedStab,
            Card::RendingFlames,
            Card::HeatedVengeance,
            Card::ViciousSlice,
        ] {
            if !state.has(card) || state.hand_len.saturating_sub(1) < card.cost() {
                continue;
            }
            let mut wield_options = vec![None];
            for weapon in Weapon::EQUIPPABLE {
                if state.has_weapon(weapon) {
                    wield_options.push(Some(weapon));
                }
            }
            let prep_options = card == Card::IgnitedStab && state.prep > 0 && state.is_assassin();
            let double = card == Card::RendingFlames && state.is_assassin() && state.fire_gy >= 3;
            for wield in wield_options {
                if prep_options {
                    result.push(Action::PlayAttack {
                        card,
                        wield,
                        prepared: true,
                        doubled: false,
                        command_ally: None,
                    });
                }
                result.push(Action::PlayAttack {
                    card,
                    wield,
                    prepared: false,
                    doubled: double,
                    command_ally: None,
                });
            }
        }
        for weapon in Weapon::EQUIPPABLE {
            if state.has_weapon(weapon) {
                result.push(Action::AttackWithWeapon(weapon));
            }
        }
    }

    // Command Automaton: an Automaton ally performs the attack (champion need not be awake).
    if !(state.go_first && state.turn == 0)
        && state.has(Card::UncannyRealization)
        && state.hand_len.saturating_sub(1) >= Card::UncannyRealization.cost()
    {
        for index in 0..state.ally_len as usize {
            let ally = state.allies[index];
            if !ally.card().is_automaton() || !ally.awake() {
                continue;
            }
            result.push(Action::PlayAttack {
                card: Card::UncannyRealization,
                wield: None,
                prepared: false,
                doubled: false,
                command_ally: Some(index as u8),
            });
        }
    }

    push_action_plays(state, mode, &mut result);

    if state.has(Card::BlazingThrow)
        && state.any_weapon()
        && state.hand_len >= 2
        && !(state.go_first && state.turn == 0)
    {
        for weapon in Weapon::EQUIPPABLE {
            if state.has_weapon(weapon) {
                result.push(Action::BlazingThrow(weapon));
            }
        }
    }
    // Main: prep-paid materialization; champion need not be leveled yet.
    if state.prep > 0 && state.has_material(MAT_BLADE) {
        result.push(Action::MercenaryBlade);
    }
    if state.is_assassin()
        && state.prep > 0
        && state.has_weapon(Weapon::AssassinsRipper)
        && state.champion_awake
    {
        result.push(Action::ActivateRipper);
    }
    if state.prep > 0 {
        for index in 0..state.ally_len as usize {
            let ally = state.allies[index];
            if ally.card() == Card::CorhaziArsonist && !ally.stealth() {
                result.push(Action::ActivateArsonist(index as u8));
            }
        }
    }
    // Soulknife can only be swung while awake, or thrown with Blazing Throw.
    if state.is_assassin()
        && state.has_material(MAT_SOULKNIFE)
        && state.fire_gy >= 3
        && !(state.go_first && state.turn == 0)
        && (state.champion_awake || (state.has(Card::BlazingThrow) && state.hand_len >= 2))
    {
        result.push(Action::MaterializeSoulknife);
    }
    result.push(Action::Pass);
    result
}

pub(crate) fn tape_phase(state: &State) -> TapePhase {
    match state.phase {
        Phase::Materialize => TapePhase::Materialize,
        Phase::PreRecollect => TapePhase::Recollect,
        Phase::Agility => TapePhase::Agility,
        Phase::Main => TapePhase::Main,
    }
}

/// Legal player actions for interactive play (`RulesMode::Full`).
pub fn legal_actions(state: State) -> Vec<Action> {
    legal_actions_with_mode(state, RulesMode::Full)
}

/// Legal actions under an explicit [`RulesMode`].
///
/// Takes `State` by value because `State` is `Copy`; prefer copying from `&State`
/// at call sites that still hold the board.
pub fn legal_actions_with_mode(state: State, mode: RulesMode) -> Vec<Action> {
    let glimpse = matches!(mode, RulesMode::Full);
    actions(state, mode, glimpse)
}

pub(crate) fn solver_actions(state: State, glimpse_enabled: bool) -> Vec<Action> {
    actions(state, RulesMode::SolverReduced, glimpse_enabled)
}
