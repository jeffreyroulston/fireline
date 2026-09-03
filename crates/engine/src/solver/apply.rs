//! Apply actions to game state and record line events.

use crate::{
    cards::Card,
    line_event::{
        ActionOp, AttackBonuses, EventFields, EventKind, EventTape, LineEvent, TapePhase,
        push_ally_gy_death,
    },
    model::{
        Action, MAT_BLADE, MAT_DAGGER, MAT_HAMMER, MAT_RING, MAT_RIPPER, MAT_SOULKNIFE,
        MAT_TRISTAN, MAT_ZANDER, MAT_ZANDER_2, Phase, State, Weapon,
    },
};
use std::cell::RefCell;

use super::actions::{action_cost, is_fast_phase, tape_phase};
use super::payment::{
    ActionPayment, AttackDiscardStep, DiscardPayment, ally_attack_discard_requirement,
    next_discard_payment, preview_hand_for_attack_discard, resolve_discard,
};

pub fn apply_action(state: State, action: Action) -> (State, Vec<LineEvent>) {
    apply_action_with_payment(state, action, None)
}

/// Apply one action with optional manual reserve payment (playtest).
pub fn apply_action_with_payment(
    state: State,
    action: Action,
    payment: Option<ActionPayment>,
) -> (State, Vec<LineEvent>) {
    let mut tape = EventTape::new();
    let next = apply_into(state, action, &mut tape, payment.as_ref());
    (next, tape.events)
}

#[cfg(test)]
pub(crate) fn apply(state: State, action: Action) -> (State, Vec<LineEvent>) {
    apply_action(state, action)
}

/// Search expansion: mutate the board without allocating combat-tape snapshots.
pub(crate) fn apply_silent(state: State, action: Action) -> State {
    thread_local! {
        static TAPE: RefCell<EventTape> = RefCell::new(EventTape::silent());
    }
    TAPE.with(|tape| apply_into(state, action, &mut tape.borrow_mut(), None))
}

pub(crate) fn apply_silent_with_payment(
    state: State,
    action: Action,
    payment: &ActionPayment,
) -> State {
    thread_local! {
        static TAPE: RefCell<EventTape> = RefCell::new(EventTape::silent());
    }
    TAPE.with(|tape| apply_into(state, action, &mut tape.borrow_mut(), Some(payment)))
}

/// Return freed heap pages to the OS after a heavy solve.
///
/// glibc-specific: `malloc_trim` only trims the *main arena*, while rayon
/// workers allocate in per-thread arenas — expect modest returns, which is
/// why this runs once per hand rather than per rollout. A musl base image
/// has no such symbol and would fail to link.
pub(crate) fn apply_into(
    mut state: State,
    action: Action,
    tape: &mut EventTape,
    payment: Option<&ActionPayment>,
) -> State {
    let reserved = payment.map(|payment| payment.reserved.as_slice());
    let mut discard = payment.map(|p| p.discard).unwrap_or(DiscardPayment::Auto);
    tape.begin_action(ActionOp::from_action(action));
    match action {
        Action::Pass => begin_agility_after_pass(&mut state, tape),
        Action::SkipAgility => finish_agility_phase(&mut state, tape),
        Action::SkipMaterialize => begin_pre_recollection(&mut state, tape),
        Action::SkipPreRecollect => finish_pre_recollection(&mut state, tape),
        Action::MaterializeHammer => {
            state.remove_material(MAT_HAMMER);
            state.equip_weapon(Weapon::ImpactHammer);
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeHammer,
                EventFields::default(),
            );
            begin_pre_recollection(&mut state, tape);
        }
        Action::MaterializeDagger => {
            state.remove_material(MAT_DAGGER);
            state.dagger = true;
            state.dagger_ready = false;
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeDagger,
                EventFields::default(),
            );
            begin_pre_recollection(&mut state, tape);
        }
        Action::MaterializeZanderMemory { glimpse_layout } => {
            state.remove_material(MAT_ZANDER);
            let from_memory = state.pay_zander_memory_cost();
            let fields = if from_memory {
                EventFields::default().from_memory()
            } else {
                EventFields::default()
            };
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::FloatForZander,
                fields,
            );
            if let Some(layout) = glimpse_layout {
                let glimpsed = state.glimpse_peek();
                state.apply_glimpse_layout(layout);
                if !glimpsed.is_empty() {
                    let mut glimpse_fields = EventFields::default();
                    if let Some(first) = glimpsed.first() {
                        glimpse_fields.card = Some(*first);
                    }
                    if let Some(second) = glimpsed.get(1) {
                        glimpse_fields.drawn = Some(*second);
                    }
                    tape.push(
                        state,
                        TapePhase::Materialize,
                        EventKind::Glimpse,
                        glimpse_fields,
                    );
                }
            }
            level_zander(&mut state, tape, TapePhase::Materialize);
            begin_pre_recollection(&mut state, tape);
        }
        Action::MaterializeTristanMemory { agility } => {
            state.remove_material(MAT_TRISTAN);
            let from_memory = state.pay_champion_memory_cost();
            let fields = if from_memory {
                EventFields::default().from_memory()
            } else {
                EventFields::default()
            };
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::FloatForTristan,
                fields,
            );
            level_tristan(&mut state, tape, TapePhase::Materialize, agility);
            begin_pre_recollection(&mut state, tape);
        }
        Action::TristanRecollect => {
            state.agility = state.agility.saturating_sub(3);
            let recollected = state.recollect_from_memory(3);
            let mut fields = EventFields::default();
            if let Some(&card) = recollected.first() {
                fields.card = Some(card);
            }
            if let Some(&card) = recollected.get(1) {
                fields.drawn = Some(card);
            }
            if let Some(&card) = recollected.get(2) {
                fields.discarded = Some(card);
            }
            tape.push(
                state,
                TapePhase::Agility,
                EventKind::TristanRecollect,
                fields,
            );
        }
        Action::MaterializeSoulknife => {
            state.remove_material(MAT_SOULKNIFE);
            state.banish_fire_from_gy(3, false);
            state.equip_weapon(Weapon::VaruckanSoulknife);
            tape.push(
                state,
                TapePhase::Main,
                EventKind::MaterializeSoulknife,
                EventFields::default(),
            );
        }
        Action::MaterializeRipper => {
            state.remove_material(MAT_RIPPER);
            let from_memory = state.pay_champion_memory_cost();
            let fields = if from_memory {
                EventFields::default().from_memory()
            } else {
                EventFields::default()
            };
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::FloatForRipper,
                fields,
            );
            state.equip_weapon(Weapon::AssassinsRipper);
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeRipper,
                EventFields::default(),
            );
            begin_pre_recollection(&mut state, tape);
        }
        Action::MaterializeRing => {
            state.remove_material(MAT_RING);
            state.ring_banished = true;
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeRing,
                EventFields::default(),
            );
            // Always banish immediately — there is no "hold the ring for later" line.
            let drawn = state.draw_unknown();
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::BanishCrusaderRing,
                EventFields::default().with_drawn(drawn),
            );
            begin_pre_recollection(&mut state, tape);
        }
        Action::ActivateDagger => {
            state.dagger = false;
            state.dagger_ready = false;
            state.add_damage(1);
            state.amplify = state.is_assassin();
            tape.push(
                state,
                tape_phase(&state),
                EventKind::ActivateDagger,
                EventFields::default(),
            );
        }
        Action::ActivateRipper => {
            state.prep = state.prep.saturating_sub(1);
            state.weapon_power_bonus = 2;
            state.champion_awake = false;
            tape.push(
                state,
                TapePhase::Main,
                EventKind::ActivateRipper,
                EventFields::default(),
            );
        }
        Action::BanishCrusaderRing => {
            // Legacy / defensive: Ring now banishes as part of MaterializeRing.
            if state.ring {
                state.ring = false;
                state.ring_banished = true;
                let drawn = state.draw_unknown();
                tape.push(
                    state,
                    TapePhase::Main,
                    EventKind::BanishCrusaderRing,
                    EventFields::default().with_drawn(drawn),
                );
            }
        }
        Action::ActivateSadi(index) => {
            if state.pay_reserve(2) {
                state.remove_ally(index as usize, false);
                state.add_hand(Card::Sadi);
                state.prep = state.prep.saturating_add(1);
                tape.push(
                    state,
                    TapePhase::Main,
                    EventKind::SadiBounce,
                    EventFields::default(),
                );
            }
        }
        Action::AttackArthur(index) => attack_ally(&mut state, index as usize, tape, discard),
        Action::AttackOthers => {
            let mut discard_queue = payment
                .map(|payment| payment.discards.clone())
                .unwrap_or_default();
            let mut index = 0;
            while index < state.ally_len as usize {
                if state.allies[index].card() != Card::Arthur && state.can_ally_attack(index) {
                    let card = state.allies[index].card();
                    let pay = next_discard_payment(&mut discard_queue, &mut discard, state, card);
                    attack_ally(&mut state, index, tape, pay);
                }
                index += 1;
            }
        }
        Action::PlayAlly {
            card,
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return,
            tristan_agility,
        } => play_ally(
            &mut state,
            card,
            kindle,
            sacrifice_ally,
            hot_cake_sacrifice,
            flagrant_level,
            flagrant_gy_return,
            tristan_agility,
            reserved,
            discard,
            tape,
        ),
        Action::PlayItem { card } => play_item(&mut state, card, reserved, tape),
        Action::PlayAttack {
            card,
            wield,
            prepared,
            doubled,
            command_ally,
        } => play_attack(PlayAttackParams {
            state: &mut state,
            card,
            wield,
            prepared,
            doubled,
            command_ally,
            reserved,
            tape,
        }),
        Action::PlayAction {
            card,
            kindle,
            prepared,
            imbue,
            sacrifice_ally,
        } => play_action(PlayActionParams {
            state: &mut state,
            card,
            kindle,
            prepared,
            imbue,
            sacrifice_ally,
            reserved,
            tape,
        }),
        Action::ActivateArsonist(index) => {
            let index = index as usize;
            if state.prep > 0
                && index < state.ally_len as usize
                && state.allies[index].card() == Card::CorhaziArsonist
                && !state.allies[index].stealth()
            {
                state.prep = state.prep.saturating_sub(1);
                state.allies[index].set_stealth(true);
                tape.push(
                    state,
                    TapePhase::Main,
                    EventKind::ArsonistStealth,
                    EventFields::card(Card::CorhaziArsonist),
                );
            }
        }
        Action::BlazingThrow(weapon) => {
            if let Some(cards) = reserved {
                if state.pay_reserve_selection(cards, false).is_none() {
                    return state;
                }
                if !state.remove_hand(Card::BlazingThrow) {
                    return state;
                }
            } else if !state.remove_hand(Card::BlazingThrow) {
                return state;
            } else {
                state.pay_reserve(1);
            }
            state.remove_weapon(weapon);
            state.send_to_gy(Card::BlazingThrow);
            state.add_damage(4);
            tape.push(
                state,
                TapePhase::Main,
                EventKind::Play,
                EventFields::card(Card::BlazingThrow).with_weapon(weapon),
            );
        }
        Action::MercenaryBlade => {
            state.remove_material(MAT_BLADE);
            state.prep -= 1;
            state.equip_weapon(Weapon::MercenaryBlade);
            let phase = tape_phase(&state);
            tape.push(
                state,
                phase,
                EventKind::MaterializeBlade,
                EventFields::default(),
            );
            if state.phase == Phase::Materialize {
                begin_pre_recollection(&mut state, tape);
            }
        }
        Action::AttackWithWeapon(weapon) => attack_with_weapon(&mut state, weapon, tape),
    }
    state
}

fn attack_with_weapon(state: &mut State, weapon: Weapon, tape: &mut EventTape) {
    if !state.has_weapon(weapon) || !state.champion_awake {
        return;
    }
    let power = state.weapon_power(weapon);
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::WieldForAttack,
        EventFields::default().with_weapon(weapon),
    );
    state.consume_weapon(weapon);
    state.champion_awake = false;
    state.add_damage(power);
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::WeaponAttack,
        EventFields::default().with_weapon(weapon),
    );
    apply_weapon_wield_self_damage(state, weapon, tape);
}

fn apply_weapon_wield_self_damage(state: &mut State, weapon: Weapon, tape: &mut EventTape) {
    if weapon == Weapon::ImpactHammer {
        state.champion_damaged = true;
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::HammerSelf,
            EventFields::default(),
        );
    }
}

// Hot search path: the payload mirrors Action::PlayAlly's fields, and grouping
// them into a struct would add indirection without clarifying the call sites.
#[expect(clippy::too_many_arguments)]
fn play_ally(
    state: &mut State,
    card: Card,
    kindle: u8,
    sacrifice_ally: Option<u8>,
    hot_cake_sacrifice: bool,
    flagrant_level: Option<u16>,
    flagrant_gy_return: Option<Card>,
    tristan_agility: bool,
    reserved: Option<&[Card]>,
    discard: DiscardPayment,
    tape: &mut EventTape,
) {
    if let Some(cards) = reserved {
        if !state.pay_with_kindle_selection(card.cost(), kindle, cards, false) {
            return;
        }
        if !state.remove_hand(card) {
            return;
        }
    } else {
        state.remove_hand(card);
        state.pay_with_kindle(card.cost(), kindle);
    }
    let arthur = card == Card::Arthur;
    let immortal = arthur;
    let phase = tape_phase(state);
    let mut sacrificed = false;
    if card == Card::PepperedChef
        && let Some(index) = sacrifice_ally
    {
        let index = index as usize;
        if index < state.ally_len as usize
            && state.allies[index].card() != Card::Arthur
            && let Some(victim) = state.remove_ally(index, true)
        {
            sacrificed = true;
            push_ally_gy_death(state, victim, phase, tape);
            tape.push(
                *state,
                phase,
                EventKind::Sacrifice,
                EventFields::card(victim),
            );
        }
    }
    // Unique: playing a second copy kills the one already on the board.
    if card.is_unique()
        && let Some(index) =
            (0..state.ally_len as usize).find(|&index| state.allies[index].card() == card)
        && let Some(victim) = state.remove_ally(index, true)
    {
        push_ally_gy_death(state, victim, phase, tape);
        tape.push(
            *state,
            phase,
            EventKind::UniqueDies,
            EventFields::card(victim),
        );
    }
    state.add_ally(card, !arthur, immortal);
    let mut fields = EventFields::card(card).with_kindle(kindle);
    if card.is_fast() && is_fast_phase(state.phase) {
        fields = fields.fast();
    }
    tape.push(*state, phase, EventKind::Play, fields);
    if arthur {
        tape.push(
            *state,
            phase,
            EventKind::Immortalize,
            EventFields::default(),
        );
    } else if card == Card::ClumsyApprentice {
        let drawn = state.draw_unknown();
        tape.push(
            *state,
            phase,
            EventKind::OnEnterDraw,
            EventFields::default().with_drawn(drawn),
        );
    } else if card == Card::PackageCourier {
        // On Enter: You may discard a card. If you do, draw a card.
        if let Some(discarded) = resolve_discard(state, discard) {
            let drawn = state.draw_unknown();
            tape.push(
                *state,
                phase,
                EventKind::OnEnterDraw,
                EventFields::card(card)
                    .with_discarded(discarded)
                    .with_drawn(drawn),
            );
        }
    } else if card == Card::Rococo {
        let influence = state.influence();
        if influence <= 4 {
            state.add_damage(2);
            tape.push(
                *state,
                phase,
                EventKind::OnEnterDamage,
                EventFields::card(Card::Rococo),
            );
        }
    } else if card == Card::FlagrantGuide {
        if let Some(mat) = flagrant_level {
            apply_flagrant_level(
                state,
                card,
                mat,
                flagrant_gy_return,
                tristan_agility,
                phase,
                tape,
            );
        }
    } else if card == Card::PepperedChef && sacrificed {
        state.agility = state.agility.saturating_add(2);
        tape.push(*state, phase, EventKind::ChefBuff, EventFields::default());
    }
    if hot_cake_sacrifice && state.hot_cake > 0 {
        state.hot_cake -= 1;
        state.send_to_gy(Card::HotCake);
        let index = state.ally_len as usize - 1;
        state.allies[index].set_attack_buff(state.allies[index].attack_buff().saturating_add(3));
        tape.push(
            *state,
            phase,
            EventKind::HotCakeSacrifice,
            EventFields::default(),
        );
    }
}

fn play_item(state: &mut State, card: Card, reserved: Option<&[Card]>, tape: &mut EventTape) {
    if let Some(cards) = reserved {
        if state.pay_reserve_selection(cards, false).is_none() {
            return;
        }
        if !state.remove_hand(card) {
            return;
        }
    } else {
        state.remove_hand(card);
        state.pay_reserve(card.cost());
    }
    if card == Card::HotCake {
        state.hot_cake = state.hot_cake.saturating_add(1);
    }
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::Play,
        EventFields::card(card),
    );
}

fn attack_ally(state: &mut State, index: usize, tape: &mut EventTape, discard: DiscardPayment) {
    let ally = state.allies[index];
    let card = ally.card();
    let arthur_buff = u8::from(card != Card::Arthur && state.arthur_rested());
    let hot_cake_buff = ally.attack_buff();
    if hot_cake_buff > 0 {
        state.allies[index].set_attack_buff(0);
    }
    let mut power = state.ally_power(ally);
    if card == Card::PepperedChef && state.agility > 0 {
        let buff = state.agility.min(2);
        power = power.saturating_add(buff);
        state.agility = state.agility.saturating_sub(buff);
    }
    power = power.saturating_add(hot_cake_buff);
    state.add_damage(power);
    state.allies[index].set_awake(false);
    let bonuses = AttackBonuses {
        arthur: arthur_buff,
        hot_cake: hot_cake_buff,
        unique: 0,
        ally_attack: 0,
    };
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::AllyAttack,
        EventFields::card(card).with_bonuses(bonuses),
    );
    if card == Card::CaptivatingCutthroat && state.is_assassin() {
        state.champion_damaged = true;
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::CutthroatSelf,
            EventFields::default(),
        );
    }
    if matches!(card, Card::HastyMessenger | Card::RedHare)
        && let Some(discarded) = resolve_discard(state, discard)
    {
        let drawn = state.draw_unknown();
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::OnAttackDraw,
            EventFields::default()
                .with_discarded(discarded)
                .with_drawn(drawn),
        );
    }
    if card == Card::CorhaziCourier && state.is_assassin() {
        let drawn = state.draw_unknown();
        if let Some(discarded) = resolve_discard(state, discard) {
            if discarded.is_fire() {
                state.add_damage(1);
            }
            tape.push(
                *state,
                TapePhase::Main,
                EventKind::CorhaziOnHit,
                EventFields::default()
                    .with_drawn(drawn)
                    .with_discarded(discarded),
            );
        }
    }
}

/// Preview every on-attack discard step for an attack action (simulated in attack order).
pub fn attack_discard_steps(mut state: State, action: Action) -> Vec<AttackDiscardStep> {
    let mut steps = Vec::new();
    match action {
        Action::AttackArthur(index) => {
            let index = index as usize;
            if index < state.ally_len as usize && state.can_ally_attack(index) {
                let card = state.allies[index].card();
                if let Some(req) = ally_attack_discard_requirement(state, card) {
                    let (hand, drawn_index) = preview_hand_for_attack_discard(state, index, req);
                    steps.push(AttackDiscardStep {
                        label: card.id().to_string(),
                        optional: req.optional,
                        hand,
                        drawn_index,
                    });
                }
            }
        }
        Action::AttackOthers => {
            let mut index = 0;
            while index < state.ally_len as usize {
                if state.allies[index].card() != Card::Arthur && state.can_ally_attack(index) {
                    let card = state.allies[index].card();
                    if let Some(req) = ally_attack_discard_requirement(state, card) {
                        let (hand, drawn_index) =
                            preview_hand_for_attack_discard(state, index, req);
                        let step_no = steps.len() + 1;
                        steps.push(AttackDiscardStep {
                            label: format!("{} ({step_no})", card.id()),
                            optional: req.optional,
                            hand,
                            drawn_index,
                        });
                    }
                    advance_attack_ally_silent(&mut state, index, DiscardPayment::Auto);
                }
                index += 1;
            }
        }
        _ => {}
    }
    steps
}

/// Apply ally attack state changes without recording tape events (preview simulation).
pub(crate) fn advance_attack_ally_silent(state: &mut State, index: usize, discard: DiscardPayment) {
    let ally = state.allies[index];
    let card = ally.card();
    let hot_cake_buff = ally.attack_buff();
    if hot_cake_buff > 0 {
        state.allies[index].set_attack_buff(0);
    }
    let mut power = state.ally_power(ally);
    if card == Card::PepperedChef && state.agility > 0 {
        let buff = state.agility.min(2);
        power = power.saturating_add(buff);
        state.agility = state.agility.saturating_sub(buff);
    }
    power = power.saturating_add(hot_cake_buff);
    state.add_damage(power);
    state.allies[index].set_awake(false);
    if card == Card::CaptivatingCutthroat && state.is_assassin() {
        state.champion_damaged = true;
    }
    if matches!(card, Card::HastyMessenger | Card::RedHare)
        && let Some(_discarded) = resolve_discard(state, discard)
    {
        let _drawn = state.draw_unknown();
    }
    if card == Card::CorhaziCourier && state.is_assassin() {
        let _drawn = state.draw_unknown();
        if let Some(discarded) = resolve_discard(state, discard)
            && discarded.is_fire()
        {
            state.add_damage(1);
        }
    }
}

struct PlayAttackParams<'a> {
    state: &'a mut State,
    card: Card,
    wield: Option<Weapon>,
    prepared: bool,
    doubled: bool,
    command_ally: Option<u8>,
    reserved: Option<&'a [Card]>,
    tape: &'a mut EventTape,
}

fn play_attack(params: PlayAttackParams<'_>) {
    let PlayAttackParams {
        state,
        card,
        wield,
        prepared,
        doubled,
        command_ally,
        reserved,
        tape,
    } = params;
    if card.is_command_automaton() {
        let Some(index) = command_ally.map(|i| i as usize) else {
            return;
        };
        if index >= state.ally_len as usize {
            return;
        }
        let ally = state.allies[index];
        if !ally.card().is_automaton() || !ally.awake() {
            return;
        }

        if let Some(cards) = reserved {
            if state.pay_reserve_selection(cards, false).is_none() {
                return;
            }
            if !state.remove_hand(card) {
                return;
            }
        } else {
            state.remove_hand(card);
            state.pay_reserve(card.cost());
        }
        let ally_attack = ally.card().power();
        let unique_bonus = u8::from(ally.card().is_unique()) * 2;
        let arthur_buff = u8::from(ally.card() != Card::Arthur && state.arthur_rested());
        let hot_cake_buff = ally.attack_buff();
        if hot_cake_buff > 0 {
            state.allies[index].set_attack_buff(0);
        }
        let power = card
            .power()
            .saturating_add(ally_attack)
            .saturating_add(unique_bonus)
            .saturating_add(arthur_buff)
            .saturating_add(hot_cake_buff);
        state.send_to_gy(card);
        state.allies[index].set_awake(false);
        state.add_damage(power);

        let bonuses = AttackBonuses {
            arthur: arthur_buff,
            hot_cake: hot_cake_buff,
            unique: unique_bonus,
            ally_attack,
        };
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::Play,
            EventFields::card(card)
                .with_command_ally(ally.card())
                .with_bonuses(bonuses),
        );
        return;
    }

    if let Some(cards) = reserved {
        if state.pay_reserve_selection(cards, false).is_none() {
            return;
        }
        if !state.remove_hand(card) {
            return;
        }
    } else {
        state.remove_hand(card);
        state.pay_reserve(card.cost());
    }
    let mut power = card.power();
    if card == Card::IgnitedStab && prepared {
        state.prep -= 1;
        power += 2;
    }
    // Champions are Human; Class Bonus +1 always applies while Assassin.
    let human_bonus = card == Card::ViciousSlice && state.is_assassin();
    if human_bonus {
        power += 1;
    }
    let mut wielded = Weapon::None;
    if let Some(weapon) = wield.filter(|&weapon| state.has_weapon(weapon)) {
        wielded = weapon;
        power += state.weapon_power(weapon);
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::WieldForAttack,
            EventFields::default().with_weapon(wielded),
        );
        state.consume_weapon(wielded);
        // Hammer self-damage is an on-attack trigger. Heated Vengeance's +3 is a
        // static "champion damaged this turn" bonus, so it must see that trigger.
        apply_weapon_wield_self_damage(state, wielded, tape);
    }
    let heated_bonus = card == Card::HeatedVengeance && state.champion_damaged;
    if heated_bonus {
        power += 3;
    }
    state.champion_awake = false;

    let mut fields = EventFields::card(card);
    if card == Card::IgnitedStab {
        fields = fields.with_prepared(prepared);
    }
    if heated_bonus {
        fields = fields.heated();
    }
    if human_bonus {
        fields = fields.human();
    }
    if wielded != Weapon::None {
        fields = fields.with_weapon(wielded);
    }

    if card == Card::RendingFlames && doubled && state.fire_gy >= 3 {
        // Banish three Fire already in the GY; the attacking copy cannot pay its own cost.
        state.banish_fire_from_gy(3, false);
        state.send_to_gy(card);
        state.add_damage(power * 2);
        tape.push(*state, TapePhase::Main, EventKind::Play, fields.doubled());
    } else {
        state.send_to_gy(card);
        state.add_damage(power);
        tape.push(*state, TapePhase::Main, EventKind::Play, fields);
    }
}

struct PlayActionParams<'a> {
    state: &'a mut State,
    card: Card,
    kindle: u8,
    prepared: bool,
    imbue: bool,
    sacrifice_ally: Option<u8>,
    reserved: Option<&'a [Card]>,
    tape: &'a mut EventTape,
}

fn play_action(params: PlayActionParams<'_>) {
    let PlayActionParams {
        state,
        card,
        kindle,
        prepared,
        imbue,
        sacrifice_ally,
        reserved,
        tape,
    } = params;
    // Additional cost legality (Undeniable Truth): the ally must exist.
    if let Some(index) = sacrifice_ally
        && index as usize >= state.ally_len as usize
    {
        return;
    }
    let cost = action_cost(state, card);
    let imbued = match reserved {
        Some(cards) => {
            let imbued = if card.imbue() == 0 {
                if !state.pay_with_kindle_selection(cost, kindle, cards, imbue) {
                    return;
                }
                false
            } else if imbue {
                if !state.pay_imbue_cost_selection(cost, card.imbue(), kindle, true, cards) {
                    return;
                }
                true
            } else {
                let imbue_n = card.imbue();
                let kindle_capped = kindle.min(cost).min(state.fire_gy);
                let reserve = cost.saturating_sub(kindle_capped);
                if cards.len() != reserve as usize {
                    return;
                }
                let Some(all_fire) = state.pay_reserve_selection(cards, false) else {
                    return;
                };
                let marched = state.banish_fire_from_gy(kindle_capped, true);
                for _ in 0..marched {
                    let already = state.allies[..state.ally_len as usize]
                        .iter()
                        .any(|ally| ally.card() == Card::MarchHare);
                    if !already {
                        state.add_ally(Card::MarchHare, true, false);
                    }
                }
                reserve >= imbue_n && all_fire
            };
            if !state.remove_hand(card) {
                return;
            }
            let phase = tape_phase(state);
            if let Some(index) = sacrifice_ally
                && let Some(victim) = state.remove_ally(index as usize, true)
            {
                push_ally_gy_death(state, victim, phase, tape);
                tape.push(
                    *state,
                    phase,
                    EventKind::Sacrifice,
                    EventFields::card(victim),
                );
            }
            imbued
        }
        None => {
            state.remove_hand(card);
            let phase = tape_phase(state);
            if let Some(index) = sacrifice_ally
                && let Some(victim) = state.remove_ally(index as usize, true)
            {
                push_ally_gy_death(state, victim, phase, tape);
                tape.push(
                    *state,
                    phase,
                    EventKind::Sacrifice,
                    EventFields::card(victim),
                );
            }
            state.pay_imbue_cost(cost, card.imbue(), kindle, imbue)
        }
    };

    if prepared && card.prepare() > 0 {
        state.prep = state.prep.saturating_sub(card.prepare());
    }
    state.send_to_gy(card);

    let mut drawn = None;
    let mut memory_draw = None;
    let mut discarded = None;
    let damage = match card {
        Card::FieryInterference => 2,
        Card::MarkTheTarget => {
            if state.is_assassin() {
                state.prep = state.prep.saturating_add(1);
            }
            1
        }
        Card::PlantedExplosive if prepared => 4,
        Card::PlantedExplosive => 2,
        Card::IntensifiedPyre if state.gy_total >= 8 => 6,
        Card::IntensifiedPyre => 2,
        Card::VermilionDecree if imbued => {
            drawn = Some(state.draw_unknown());
            3
        }
        Card::VermilionDecree => 3,
        Card::Demolition => 3,
        Card::SurgingBolt if imbued => 4,
        Card::SurgingBolt => 3,
        Card::IgniteFate => {
            // Hits each champion; only the opponent's life is scored, but ours
            // registering damage enables Heated Vengeance.
            state.champion_damaged = true;
            2
        }
        Card::IncreasingDanger => {
            drawn = Some(state.draw_unknown());
            memory_draw = Some(state.draw_to_memory());
            0
        }
        Card::CreativeShock => {
            drawn = Some(state.draw_unknown());
            memory_draw = Some(state.draw_unknown());
            discarded = state.discard_for_effect();
            0
        }
        Card::UndeniableTruth => {
            drawn = Some(state.draw_unknown());
            state.prep = state.prep.saturating_add(1);
            0
        }
        Card::SmokeOut => 1,
        Card::SparkAlight => 2,
        Card::FlurryOfFire => 1,
        // Incapacitate and Reduce to Ash have no modeled effect.
        _ => 0,
    };
    // Flurry of Fire deals 1 twice so Poisoned Dagger amplify applies per hit.
    if card == Card::FlurryOfFire {
        state.add_damage(1);
        state.add_damage(1);
    } else {
        state.add_damage(damage);
    }

    let mut fields = EventFields::card(card).with_kindle(kindle);
    if card.prepare() > 0 {
        fields = fields.with_prepared(prepared);
    }
    if imbued {
        fields = fields.with_imbue(true);
    }
    if let Some(drawn) = drawn {
        fields = fields.with_drawn(drawn);
    }
    if let Some(memory_draw) = memory_draw {
        fields = fields.with_memory_draw(memory_draw);
    }
    if let Some(discarded) = discarded {
        fields = fields.with_discarded(discarded);
    }
    if card.is_fast() && is_fast_phase(state.phase) {
        fields = fields.fast();
    }
    if card == Card::IntensifiedPyre && damage == 6 {
        fields = fields.gy_threshold();
    }

    let phase = tape_phase(state);
    tape.push(*state, phase, EventKind::Play, fields);
}

fn level_tristan(state: &mut State, tape: &mut EventTape, phase: TapePhase, take_agility: bool) {
    state.tristan_leveled = true;
    state.champion_level = 1;
    let mut fields = EventFields::default();
    if take_agility {
        state.agility = state.agility.saturating_add(3);
        fields = fields.with_kindle(3);
    } else {
        state.prep = state.prep.saturating_add(1);
    }
    tape.push(*state, phase, EventKind::LevelTristan, fields);
}

fn level_zander(state: &mut State, tape: &mut EventTape, phase: TapePhase) {
    state.champion_level = 1;
    state.prep = state.prep.saturating_add(1);
    tape.push(
        *state,
        phase,
        EventKind::LevelZander,
        EventFields::default(),
    );
}

fn level_zander2(
    state: &mut State,
    gy_return: Option<Card>,
    tape: &mut EventTape,
    phase: TapePhase,
) {
    state.champion_level = 2;
    state.prep = state.prep.saturating_add(2);
    tape.push(
        *state,
        phase,
        EventKind::LevelZander2,
        EventFields::default(),
    );
    if let Some(card) = gy_return {
        state.prep = state.prep.saturating_sub(1);
        state.remove_one_from_gy(card);
        state.add_hand(card);
        tape.push(
            *state,
            phase,
            EventKind::ZanderGyReturn,
            EventFields::default().with_drawn(card),
        );
    }
}

fn apply_flagrant_level(
    state: &mut State,
    card: Card,
    mat: u16,
    gy_return: Option<Card>,
    tristan_agility: bool,
    phase: TapePhase,
    tape: &mut EventTape,
) {
    let self_dmg = 6u8.saturating_add(4 * state.champion_level);
    state.champion_damaged = true;
    state.remove_material(mat);
    tape.push(
        *state,
        phase,
        EventKind::OnEnterLevel,
        EventFields::card(card).with_kindle(self_dmg),
    );
    if mat == MAT_ZANDER {
        level_zander(state, tape, phase);
    } else if mat == MAT_ZANDER_2 {
        level_zander2(state, gy_return, tape, phase);
    } else {
        level_tristan(state, tape, phase, tristan_agility);
    }
}

fn begin_pre_recollection(state: &mut State, tape: &mut EventTape) {
    tape.push(
        *state,
        TapePhase::Recollect,
        EventKind::MaterializeResolves,
        EventFields::default(),
    );
    state.phase = Phase::PreRecollect;
}

fn finish_pre_recollection(state: &mut State, tape: &mut EventTape) {
    let drawn = state.recollect();
    state.phase = Phase::Main;
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::Recollect,
        EventFields::default().with_drawn(drawn),
    );
}

fn begin_agility_after_pass(state: &mut State, tape: &mut EventTape) {
    tape.push(
        *state,
        TapePhase::Agility,
        EventKind::PassOpportunity,
        EventFields::default(),
    );
    if state.tristan_leveled {
        state.phase = Phase::Agility;
        return;
    }
    finish_agility_phase(state, tape);
}

fn finish_agility_phase(state: &mut State, tape: &mut EventTape) {
    tape.push(
        *state,
        TapePhase::End,
        EventKind::EndAgility,
        EventFields::default(),
    );
    advance_after_agility(state, tape);
}

fn advance_after_agility(state: &mut State, tape: &mut EventTape) {
    state.phase = Phase::Main;
    tape.push(
        *state,
        TapePhase::EnemyMain,
        EventKind::EndMain,
        EventFields::default(),
    );
    state.turn += 1;
    // Horizon is playable turns. After the last Main/Agility, stop. No free
    // opponent cull or main after the line is over.
    if state.is_terminal() {
        return;
    }
    state.enemy_cull(Some(tape));
    tape.push(
        *state,
        TapePhase::EnemyEnd,
        EventKind::EnemyMain,
        EventFields::default(),
    );
    tape.push(
        *state,
        TapePhase::Wake,
        EventKind::Wake,
        EventFields::default(),
    );
    state.wake();
    tape.push(
        *state,
        TapePhase::Materialize,
        EventKind::Wake,
        EventFields::default(),
    );
    state.phase = Phase::Materialize;
}
