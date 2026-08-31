//! Per-card line statistics collected from the reconstructed optimal path.

use crate::cards::{ALL_CARDS, CARD_COUNT, Card, PLAYABLE_CARDS};
use crate::line_event::{EventKind, LineEvent};
use crate::model::{Action, State, Weapon};
use serde::Serialize;
use std::collections::BTreeMap;

#[cfg(feature = "ts")]
use ts_rs::TS;

pub const MATERIAL_COUNT: usize = 9;
pub const MATERIAL_IDS: [&str; MATERIAL_COUNT] = [
    "impact_hammer",
    "mercenary_blade",
    "poisoned_dagger",
    "zander_1",
    "zander_2",
    "varuckan_soulknife",
    "tristan_1",
    "assassins_ripper",
    "grand_crusaders_ring",
];
pub const MATERIAL_NAMES: [&str; MATERIAL_COUNT] = [
    "Impact Hammer",
    "Mercenary's Blade",
    "Poisoned Dagger",
    "Zander, Prepared Scout",
    "Zander, Deft Executor",
    "Varuckan Soulknife",
    "Tristan, Underhanded",
    "Assassin's Ripper",
    "Grand Crusader's Ring",
];
const MAT_HAMMER: usize = 0;
const MAT_BLADE: usize = 1;
const MAT_DAGGER: usize = 2;
const MAT_ZANDER: usize = 3;
const MAT_ZANDER_2: usize = 4;
const MAT_SOULKNIFE: usize = 5;
const MAT_TRISTAN: usize = 6;
const MAT_RIPPER: usize = 7;
const MAT_RING: usize = 8;

#[derive(Clone, Debug)]
pub struct LineCardStats {
    pub plays: [u32; CARD_COUNT],
    pub attacks: [u32; CARD_COUNT],
    pub damage: [u32; CARD_COUNT],
    /// Mid-line draws (not opening hand). Bricks ignored.
    pub drawn: [u32; CARD_COUNT],
    pub material_plays: [u32; MATERIAL_COUNT],
    pub material_attacks: [u32; MATERIAL_COUNT],
    pub material_damage: [u32; MATERIAL_COUNT],
}

impl Default for LineCardStats {
    fn default() -> Self {
        Self {
            plays: [0; CARD_COUNT],
            attacks: [0; CARD_COUNT],
            damage: [0; CARD_COUNT],
            drawn: [0; CARD_COUNT],
            material_plays: [0; MATERIAL_COUNT],
            material_attacks: [0; MATERIAL_COUNT],
            material_damage: [0; MATERIAL_COUNT],
        }
    }
}

impl LineCardStats {
    pub fn record_action(
        &mut self,
        action: Action,
        before: State,
        after: State,
        events: &[LineEvent],
    ) {
        let before_damage = before.damage;
        match action {
            Action::PlayAlly {
                card,
                flagrant_level,
                ..
            } => {
                self.plays[card.index()] += 1;
                if let Some(mat) = flagrant_level {
                    if mat == crate::model::MAT_ZANDER {
                        self.material_plays[MAT_ZANDER] += 1;
                    } else if mat == crate::model::MAT_ZANDER_2 {
                        self.material_plays[MAT_ZANDER_2] += 1;
                    } else if mat == crate::model::MAT_TRISTAN {
                        self.material_plays[MAT_TRISTAN] += 1;
                    }
                }
                self.attribute_play_bundle(card, events, before_damage);
            }
            Action::PlayItem { card } => {
                self.plays[card.index()] += 1;
                self.record_draws_in_events(events);
            }
            Action::PlayAttack { card, .. } => {
                self.plays[card.index()] += 1;
                let delta = u32::from(after.damage.saturating_sub(before_damage));
                self.damage[card.index()] += delta;
                self.record_draws_in_events(events);
            }
            Action::PlayAction { card, .. } => {
                self.plays[card.index()] += 1;
                // Undeniable Truth can bundle an On Death (sacrificed ally);
                // credit that damage to the dead card, the rest to the action.
                let mut prev = before_damage;
                let mut claimed = 0_u32;
                for event in events {
                    let delta = u32::from(event.damage.saturating_sub(prev));
                    prev = event.damage;
                    if delta > 0
                        && event.kind == EventKind::OnDeath
                        && let Some(dead) = event.card.and_then(card_from_id)
                    {
                        self.damage[dead.index()] += delta;
                        claimed += delta;
                    }
                    self.record_draw_event(event);
                }
                let delta = u32::from(after.damage.saturating_sub(before_damage));
                self.damage[card.index()] += delta.saturating_sub(claimed);
            }
            Action::BlazingThrow(_) => {
                self.plays[Card::BlazingThrow.index()] += 1;
                self.damage[Card::BlazingThrow.index()] +=
                    u32::from(after.damage.saturating_sub(before_damage));
            }
            Action::AttackArthur(index) => {
                let card = before.allies[index as usize].card();
                self.attacks[card.index()] += 1;
                self.attribute_attack_bundle(card, events, before_damage);
            }
            Action::AttackOthers => self.attribute_multi_attacks(events, before_damage),
            Action::MaterializeHammer => {
                self.material_plays[MAT_HAMMER] += 1;
                self.record_draws_in_events(events);
            }
            Action::MaterializeDagger => {
                self.material_plays[MAT_DAGGER] += 1;
                self.record_draws_in_events(events);
            }
            Action::MaterializeZanderMemory { .. } => {
                self.material_plays[MAT_ZANDER] += 1;
                self.record_draws_in_events(events);
            }
            Action::MaterializeTristanMemory | Action::TristanRecollect => {
                self.material_plays[MAT_TRISTAN] += 1;
                self.record_draws_in_events(events);
            }
            Action::MaterializeSoulknife => {
                self.material_plays[MAT_SOULKNIFE] += 1;
                self.record_draws_in_events(events);
            }
            Action::MaterializeRipper => {
                self.material_plays[MAT_RIPPER] += 1;
                self.record_draws_in_events(events);
            }
            Action::MaterializeRing => {
                self.material_plays[MAT_RING] += 1;
                self.record_draws_in_events(events);
            }
            Action::BanishCrusaderRing => {
                self.material_plays[MAT_RING] += 1;
                self.record_draws_in_events(events);
            }
            Action::MercenaryBlade => {
                self.material_plays[MAT_BLADE] += 1;
                self.record_draws_in_events(events);
            }
            Action::ActivateDagger => {
                self.material_attacks[MAT_DAGGER] += 1;
                self.material_damage[MAT_DAGGER] +=
                    u32::from(after.damage.saturating_sub(before_damage));
                self.record_draws_in_events(events);
            }
            Action::AttackWithWeapon(weapon) => {
                if let Some(index) = material_index_from_weapon(weapon) {
                    self.material_attacks[index] += 1;
                    self.material_damage[index] +=
                        u32::from(after.damage.saturating_sub(before_damage));
                }
                self.record_draws_in_events(events);
            }
            Action::Pass => self.attribute_on_death_events(events, before_damage),
            _ => self.record_draws_in_events(events),
        }
    }

    fn attribute_play_bundle(&mut self, card: Card, events: &[LineEvent], before_damage: u8) {
        let mut prev = before_damage;
        for event in events {
            let delta = u32::from(event.damage.saturating_sub(prev));
            prev = event.damage;
            if delta > 0 {
                match event.kind {
                    EventKind::OnDeath => {
                        if let Some(dead) = event.card.and_then(card_from_id) {
                            self.damage[dead.index()] += delta;
                        }
                    }
                    EventKind::OnEnterDamage => {
                        self.damage[card.index()] += delta;
                    }
                    _ => {}
                }
            }
            self.record_draw_event(event);
        }
    }

    fn attribute_on_death_events(&mut self, events: &[LineEvent], before_damage: u8) {
        let mut prev = before_damage;
        for event in events {
            let delta = u32::from(event.damage.saturating_sub(prev));
            prev = event.damage;
            if delta > 0
                && event.kind == EventKind::OnDeath
                && let Some(card) = event.card.and_then(card_from_id)
            {
                self.damage[card.index()] += delta;
            }
            self.record_draw_event(event);
        }
    }

    fn attribute_attack_bundle(&mut self, card: Card, events: &[LineEvent], before_damage: u8) {
        let mut prev = before_damage;
        for event in events {
            let delta = u32::from(event.damage.saturating_sub(prev));
            prev = event.damage;
            match event.kind {
                EventKind::AllyAttack => {
                    let attacker = event.card.and_then(card_from_id).unwrap_or(card);
                    attribute_attack_damage(event, delta, attacker, &mut self.damage);
                }
                EventKind::CorhaziOnHit => {
                    self.damage[Card::CorhaziCourier.index()] += delta;
                }
                _ if delta > 0 => {
                    self.damage[card.index()] += delta;
                }
                _ => {}
            }
            self.record_draw_event(event);
        }
    }

    fn attribute_multi_attacks(&mut self, events: &[LineEvent], before_damage: u8) {
        let mut prev = before_damage;
        let mut current: Option<Card> = None;
        for event in events {
            let delta = u32::from(event.damage.saturating_sub(prev));
            prev = event.damage;
            match event.kind {
                EventKind::AllyAttack => {
                    if let Some(card) = event.card.and_then(card_from_id) {
                        current = Some(card);
                        self.attacks[card.index()] += 1;
                        attribute_attack_damage(event, delta, card, &mut self.damage);
                    }
                }
                EventKind::CorhaziOnHit => {
                    self.damage[Card::CorhaziCourier.index()] += delta;
                    self.record_draw_event(event);
                }
                _ => {
                    if delta > 0
                        && let Some(card) = current
                    {
                        self.damage[card.index()] += delta;
                    }
                    self.record_draw_event(event);
                }
            }
        }
    }

    fn record_draws_in_events(&mut self, events: &[LineEvent]) {
        for event in events {
            self.record_draw_event(event);
        }
    }

    fn record_draw_event(&mut self, event: &LineEvent) {
        if let Some(card) = event.drawn.and_then(card_from_id) {
            self.record_opening_draw(card);
        }
        if let Some(card) = event.memory_draw.and_then(card_from_id) {
            self.record_opening_draw(card);
        }
    }

    pub fn record_opening_draw(&mut self, card: Card) {
        if card != Card::Brick {
            self.drawn[card.index()] += 1;
        }
    }

    pub fn merge_into(&self, target: &mut LineCardStats) {
        for index in 0..CARD_COUNT {
            target.plays[index] += self.plays[index];
            target.attacks[index] += self.attacks[index];
            target.damage[index] += self.damage[index];
            target.drawn[index] += self.drawn[index];
        }
        for index in 0..MATERIAL_COUNT {
            target.material_plays[index] += self.material_plays[index];
            target.material_attacks[index] += self.material_attacks[index];
            target.material_damage[index] += self.material_damage[index];
        }
    }

    /// Nonzero counters keyed by card id, for persistence.
    pub fn to_sparse(&self) -> SparseLineStats {
        let mut plays = BTreeMap::new();
        let mut attacks = BTreeMap::new();
        let mut damage = BTreeMap::new();
        let mut drawn = BTreeMap::new();
        for card in PLAYABLE_CARDS {
            let index = card.index();
            if self.plays[index] > 0 {
                plays.insert(card.id(), self.plays[index]);
            }
            if self.attacks[index] > 0 {
                attacks.insert(card.id(), self.attacks[index]);
            }
            if self.damage[index] > 0 {
                damage.insert(card.id(), self.damage[index]);
            }
            if self.drawn[index] > 0 {
                drawn.insert(card.id(), self.drawn[index]);
            }
        }
        for (index, &id) in MATERIAL_IDS.iter().enumerate() {
            if self.material_plays[index] > 0 {
                plays.insert(id, self.material_plays[index]);
            }
            if self.material_attacks[index] > 0 {
                attacks.insert(id, self.material_attacks[index]);
            }
            if self.material_damage[index] > 0 {
                damage.insert(id, self.material_damage[index]);
            }
        }
        SparseLineStats {
            plays,
            attacks,
            damage,
            drawn,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.plays.iter().all(|&v| v == 0)
            && self.attacks.iter().all(|&v| v == 0)
            && self.damage.iter().all(|&v| v == 0)
            && self.drawn.iter().all(|&v| v == 0)
            && self.material_plays.iter().all(|&v| v == 0)
            && self.material_attacks.iter().all(|&v| v == 0)
            && self.material_damage.iter().all(|&v| v == 0)
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct SparseLineStats {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub plays: BTreeMap<&'static str, u32>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub attacks: BTreeMap<&'static str, u32>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub damage: BTreeMap<&'static str, u32>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub drawn: BTreeMap<&'static str, u32>,
}

impl SparseLineStats {
    pub fn is_empty_stats(stats: &Self) -> bool {
        stats.plays.is_empty()
            && stats.attacks.is_empty()
            && stats.damage.is_empty()
            && stats.drawn.is_empty()
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct CardStat {
    pub card: &'static str,
    pub name: &'static str,
    pub copies: u8,
    /// Samples where ≥1 copy was in the opening hand.
    pub opened: u32,
    /// Total opening-hand copies across samples.
    pub opened_copies: u32,
    /// Mid-line draws across samples (bricks excluded).
    pub drawn: u32,
    /// Samples where the card was opened or drawn mid-line.
    pub seen: u32,
    pub plays: u32,
    pub attacks: u32,
    pub damage: u32,
    pub damage_when_seen_sum: u32,
    pub open_rate: f64,
    pub see_rate: f64,
    /// Plays per sample.
    pub play_rate: f64,
    /// Plays / in-hand copies (opened + drawn).
    pub play_when_in_hand: f64,
    /// Mean damage on samples where seen.
    pub damage_when_seen: f64,
    pub damage_per_play: f64,
    /// Share of all attributed card damage.
    pub damage_share: f64,
    /// Sum of sample damage when this card was in the opening hand.
    #[serde(default)]
    pub with_hand_damage_sum: u32,
    /// Samples where this card was in the opening hand.
    #[serde(default)]
    pub with_hand_samples: u32,
    /// Sum of sample damage when this card was not in the opening hand.
    #[serde(default)]
    pub without_hand_damage_sum: u32,
    /// Samples where this card was not in the opening hand.
    #[serde(default)]
    pub without_hand_samples: u32,
}

pub struct DeckStatAccumulator {
    samples: u32,
    copies: [u8; CARD_COUNT],
    opened: [u32; CARD_COUNT],
    opened_copies: [u32; CARD_COUNT],
    seen: [u32; CARD_COUNT],
    line: LineCardStats,
    /// Per-sample damage attributed (summed) for damage_when_seen.
    damage_when_seen_sum: [u32; CARD_COUNT],
    hand_damage_with: [u32; CARD_COUNT],
    hand_samples_with: [u32; CARD_COUNT],
    hand_damage_without: [u32; CARD_COUNT],
    hand_samples_without: [u32; CARD_COUNT],
    materials_mask: u16,
}

impl Default for DeckStatAccumulator {
    fn default() -> Self {
        Self {
            samples: 0,
            copies: [0; CARD_COUNT],
            opened: [0; CARD_COUNT],
            opened_copies: [0; CARD_COUNT],
            seen: [0; CARD_COUNT],
            line: LineCardStats::default(),
            damage_when_seen_sum: [0; CARD_COUNT],
            hand_damage_with: [0; CARD_COUNT],
            hand_samples_with: [0; CARD_COUNT],
            hand_damage_without: [0; CARD_COUNT],
            hand_samples_without: [0; CARD_COUNT],
            materials_mask: crate::model::ALL_MATERIALS,
        }
    }
}

impl DeckStatAccumulator {
    pub fn with_deck(deck: &[Card]) -> Self {
        Self::with_deck_and_materials(deck, crate::model::ALL_MATERIALS)
    }

    pub fn with_deck_and_materials(deck: &[Card], materials_mask: u16) -> Self {
        let mut copies = [0_u8; CARD_COUNT];
        for &card in deck {
            copies[card.index()] = copies[card.index()].saturating_add(1);
        }
        Self {
            copies,
            materials_mask,
            ..Self::default()
        }
    }

    pub fn add_sample(&mut self, opening: &[Card], stats: &LineCardStats) {
        self.samples += 1;
        let mut opened_this = [false; CARD_COUNT];
        let mut seen_this = [false; CARD_COUNT];

        for &card in opening {
            if card == Card::Brick {
                continue;
            }
            let index = card.index();
            opened_this[index] = true;
            seen_this[index] = true;
            self.opened_copies[index] += 1;
        }
        for index in 0..CARD_COUNT {
            if opened_this[index] {
                self.opened[index] += 1;
            }
            if stats.drawn[index] > 0 {
                seen_this[index] = true;
            }
            if seen_this[index] {
                self.seen[index] += 1;
                self.damage_when_seen_sum[index] += stats.damage[index];
            }
        }
        stats.merge_into(&mut self.line);
    }

    /// Record the sample's total damage into opening-hand with/without buckets.
    /// Call once per physical sample, including two-pass (where `add_sample` runs twice).
    pub fn add_hand_outcome(&mut self, opening: &[Card], sample_damage: u8) {
        let mut opened_this = [false; CARD_COUNT];
        for &card in opening {
            if card == Card::Brick {
                continue;
            }
            opened_this[card.index()] = true;
        }
        let damage = u32::from(sample_damage);
        for index in 0..CARD_COUNT {
            if self.copies[index] == 0 {
                continue;
            }
            if opened_this[index] {
                self.hand_samples_with[index] += 1;
                self.hand_damage_with[index] = self.hand_damage_with[index].saturating_add(damage);
            } else {
                self.hand_samples_without[index] += 1;
                self.hand_damage_without[index] =
                    self.hand_damage_without[index].saturating_add(damage);
            }
        }
    }

    pub fn finish(self) -> Vec<CardStat> {
        let samples = self.samples.max(1) as f64;
        let total_damage: u32 = PLAYABLE_CARDS
            .iter()
            .map(|card| self.line.damage[card.index()])
            .sum::<u32>()
            + self.line.material_damage.iter().sum::<u32>();
        let total_damage_f = f64::from(total_damage.max(1));

        let mut rows = PLAYABLE_CARDS
            .iter()
            .filter(|card| self.copies[card.index()] > 0)
            .map(|&card| {
                let index = card.index();
                let plays = self.line.plays[index];
                let seen = self.seen[index];
                let in_hand = self.opened_copies[index] + self.line.drawn[index];
                let damage = self.line.damage[index];
                CardStat {
                    card: card.id(),
                    name: card.name(),
                    copies: self.copies[index],
                    opened: self.opened[index],
                    opened_copies: self.opened_copies[index],
                    drawn: self.line.drawn[index],
                    seen,
                    plays,
                    attacks: self.line.attacks[index],
                    damage,
                    damage_when_seen_sum: self.damage_when_seen_sum[index],
                    open_rate: f64::from(self.opened[index]) / samples,
                    see_rate: f64::from(seen) / samples,
                    play_rate: f64::from(plays) / samples,
                    play_when_in_hand: if in_hand > 0 {
                        f64::from(plays) / f64::from(in_hand)
                    } else {
                        0.0
                    },
                    damage_when_seen: if seen > 0 {
                        f64::from(self.damage_when_seen_sum[index]) / f64::from(seen)
                    } else {
                        0.0
                    },
                    damage_per_play: if plays > 0 {
                        f64::from(damage) / f64::from(plays)
                    } else {
                        0.0
                    },
                    damage_share: f64::from(damage) / total_damage_f,
                    with_hand_damage_sum: self.hand_damage_with[index],
                    with_hand_samples: self.hand_samples_with[index],
                    without_hand_damage_sum: self.hand_damage_without[index],
                    without_hand_samples: self.hand_samples_without[index],
                }
            })
            .collect::<Vec<_>>();

        for index in 0..MATERIAL_COUNT {
            let material_bit = 1_u16 << index;
            if self.materials_mask & material_bit == 0 {
                continue;
            }
            let plays = self.line.material_plays[index];
            let damage = self.line.material_damage[index];
            rows.push(CardStat {
                card: MATERIAL_IDS[index],
                name: MATERIAL_NAMES[index],
                copies: 1,
                opened: self.samples,
                opened_copies: self.samples,
                drawn: 0,
                seen: self.samples,
                plays,
                attacks: self.line.material_attacks[index],
                damage,
                damage_when_seen_sum: damage,
                open_rate: 1.0,
                see_rate: 1.0,
                play_rate: f64::from(plays) / samples,
                play_when_in_hand: f64::from(plays) / samples,
                damage_when_seen: f64::from(damage) / samples,
                damage_per_play: if plays > 0 {
                    f64::from(damage) / f64::from(plays)
                } else {
                    0.0
                },
                damage_share: f64::from(damage) / total_damage_f,
                with_hand_damage_sum: 0,
                with_hand_samples: 0,
                without_hand_damage_sum: 0,
                without_hand_samples: 0,
            });
        }

        rows.sort_by(|a, b| {
            b.damage
                .cmp(&a.damage)
                .then_with(|| b.plays.cmp(&a.plays))
                .then_with(|| a.name.cmp(b.name))
        });
        rows
    }
}

fn material_index_from_weapon(weapon: Weapon) -> Option<usize> {
    match weapon {
        Weapon::ImpactHammer => Some(MAT_HAMMER),
        Weapon::MercenaryBlade => Some(MAT_BLADE),
        Weapon::VaruckanSoulknife => Some(MAT_SOULKNIFE),
        Weapon::AssassinsRipper => Some(MAT_RIPPER),
        Weapon::None => None,
    }
}

fn card_from_id(id: &str) -> Option<Card> {
    ALL_CARDS.into_iter().find(|card| card.id() == id)
}

fn attribute_attack_damage(
    event: &LineEvent,
    delta: u32,
    attacker: Card,
    damage: &mut [u32; CARD_COUNT],
) {
    let (arthur_bonus, hot_cake_bonus) = event
        .bonuses
        .as_ref()
        .map(|b| (u32::from(b.arthur), u32::from(b.hot_cake)))
        .unwrap_or((0, 0));
    let buff_total = arthur_bonus + hot_cake_bonus;
    let base = delta.saturating_sub(buff_total);
    if base > 0 {
        damage[attacker.index()] += base;
    }
    if arthur_bonus > 0 {
        damage[Card::Arthur.index()] += arthur_bonus;
    }
    if hot_cake_bonus > 0 {
        damage[Card::HotCake.index()] += hot_cake_bonus;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::line_event::{AttackBonuses, EventFields, EventTape, TapePhase};

    #[test]
    fn records_recollect_draw() {
        let mut tape = EventTape::new();
        let state = State::new(&[Card::Arthur], true, 1);
        tape.begin_action(crate::line_event::ActionOp::SkipMaterialize);
        tape.push(
            state,
            TapePhase::Main,
            EventKind::Recollect,
            EventFields::default().with_drawn(Card::Arthur),
        );
        let mut stats = LineCardStats::default();
        stats.record_draws_in_events(&tape.events);
        assert_eq!(stats.drawn[Card::Arthur.index()], 1);
    }

    #[test]
    fn records_vermilion_imbue_draw() {
        let mut tape = EventTape::new();
        let state = State::new(&[Card::VermilionDecree], true, 1);
        tape.begin_action(crate::line_event::ActionOp::PlayAction);
        tape.push(
            state,
            TapePhase::Main,
            EventKind::Play,
            EventFields::card(Card::VermilionDecree)
                .with_imbue(true)
                .with_drawn(Card::HotCake),
        );
        let mut stats = LineCardStats::default();
        stats.record_draws_in_events(&tape.events);
        assert_eq!(stats.drawn[Card::HotCake.index()], 1);
    }

    #[test]
    fn attributes_attack_bonuses() {
        let mut damage = [0_u32; CARD_COUNT];
        let event = LineEvent {
            op: crate::line_event::ActionOp::AttackArthur,
            kind: EventKind::AllyAttack,
            action_index: 1,
            turn: 1,
            phase: TapePhase::Main,
            damage: 4,
            fire_gy: 0,
            card: Some("clumsy_apprentice"),
            kindle: None,
            drawn: None,
            memory_draw: None,
            discarded: None,
            prepared: None,
            imbue: None,
            weapon: None,
            command_ally: None,
            bonuses: Some(AttackBonuses {
                arthur: 1,
                hot_cake: 3,
                unique: 0,
                ally_attack: 0,
            }),
            hand: None,
            memory: None,
            allies: None,
            fast: false,
            doubled: false,
            from_memory: false,
            heated: false,
            human: false,
            gy_threshold: false,
        };
        attribute_attack_damage(&event, 4, Card::ClumsyApprentice, &mut damage);
        assert_eq!(damage[Card::ClumsyApprentice.index()], 0);
        assert_eq!(damage[Card::Arthur.index()], 1);
        assert_eq!(damage[Card::HotCake.index()], 3);
    }

    #[test]
    fn records_material_plays() {
        let state = State::new(&[Card::Arthur], true, 1);
        let mut stats = LineCardStats::default();
        stats.record_action(Action::MaterializeHammer, state, state, &[]);
        assert_eq!(stats.material_plays[MAT_HAMMER], 1);
        let sparse = stats.to_sparse();
        assert_eq!(sparse.plays.get("impact_hammer").copied(), Some(1));
    }

    #[test]
    fn records_weapon_attack_damage() {
        let mut before = State::new(&[Card::Arthur], true, 1);
        before.equip_weapon(Weapon::ImpactHammer);
        let mut after = before;
        after.damage = 3;
        let mut stats = LineCardStats::default();
        stats.record_action(
            Action::AttackWithWeapon(Weapon::ImpactHammer),
            before,
            after,
            &[],
        );
        assert_eq!(stats.material_attacks[MAT_HAMMER], 1);
        assert_eq!(stats.material_damage[MAT_HAMMER], 3);
        let sparse = stats.to_sparse();
        assert_eq!(sparse.attacks.get("impact_hammer").copied(), Some(1));
        assert_eq!(sparse.damage.get("impact_hammer").copied(), Some(3));
    }

    #[test]
    fn finish_includes_material_rows() {
        let mut acc = DeckStatAccumulator::with_deck(&[Card::Arthur]);
        acc.add_sample(&[Card::Arthur], &LineCardStats::default());
        let rows = acc.finish();
        let hammer = rows
            .iter()
            .find(|row| row.card == "impact_hammer")
            .expect("impact hammer row");
        assert_eq!(hammer.copies, 1);
        assert_eq!(hammer.seen, 1);
        assert_eq!(hammer.plays, 0);
    }

    #[test]
    fn hand_outcome_splits_sample_damage_by_opening() {
        let mut acc = DeckStatAccumulator::with_deck(&[Card::Arthur, Card::KingdomInformant]);
        acc.add_sample(&[Card::Arthur], &LineCardStats::default());
        acc.add_hand_outcome(&[Card::Arthur], 10);
        acc.add_sample(&[Card::KingdomInformant], &LineCardStats::default());
        acc.add_hand_outcome(&[Card::KingdomInformant], 4);
        let rows = acc.finish();
        let arthur = rows
            .iter()
            .find(|row| row.card == "arthur")
            .expect("arthur row");
        assert_eq!(arthur.with_hand_samples, 1);
        assert_eq!(arthur.with_hand_damage_sum, 10);
        assert_eq!(arthur.without_hand_samples, 1);
        assert_eq!(arthur.without_hand_damage_sum, 4);
        let informant = rows
            .iter()
            .find(|row| row.card == "kingdom_informant")
            .expect("informant row");
        assert_eq!(informant.with_hand_samples, 1);
        assert_eq!(informant.with_hand_damage_sum, 4);
        assert_eq!(informant.without_hand_samples, 1);
        assert_eq!(informant.without_hand_damage_sum, 10);
    }
}
