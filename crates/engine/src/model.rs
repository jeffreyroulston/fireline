use crate::budget::Budget;
use crate::cards::{ALL_CARDS, CARD_COUNT, Card};
use crate::version::EngineVersion;
use serde::{Deserialize, Serialize};

#[cfg(feature = "ts")]
use ts_rs::TS;

use std::collections::BTreeMap;
use std::hash::{Hash, Hasher};

pub const MAT_HAMMER: u8 = 1 << 0;
pub const MAT_BLADE: u8 = 1 << 1;
pub const MAT_DAGGER: u8 = 1 << 2;
pub const MAT_ZANDER: u8 = 1 << 3;
pub const MAT_SOULKNIFE: u8 = 1 << 4;
pub const ALL_MATERIALS: u8 = MAT_HAMMER | MAT_BLADE | MAT_DAGGER | MAT_ZANDER | MAT_SOULKNIFE;
pub const DRAW_QUEUE_CAP: usize = 64;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PaymentMode {
    Default,
    FireOnly,
}

#[repr(transparent)]
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Hash)]
pub struct Ally(u32);

impl Ally {
    const AWAKE: u32 = 1 << 8;
    const IMMORTAL: u32 = 1 << 9;
    const BUFF_SHIFT: u32 = 16;

    pub fn new(card: Card, awake: bool, immortal: bool, attack_buff: u8) -> Self {
        let mut raw = card as u32;
        if awake {
            raw |= Self::AWAKE;
        }
        if immortal {
            raw |= Self::IMMORTAL;
        }
        raw |= (attack_buff as u32) << Self::BUFF_SHIFT;
        Self(raw)
    }

    #[inline]
    pub fn card(self) -> Card {
        ALL_CARDS[(self.0 & 0xFF) as usize]
    }

    #[inline]
    pub fn awake(self) -> bool {
        self.0 & Self::AWAKE != 0
    }

    #[inline]
    pub fn immortal(self) -> bool {
        self.0 & Self::IMMORTAL != 0
    }

    #[inline]
    pub fn attack_buff(self) -> u8 {
        (self.0 >> Self::BUFF_SHIFT) as u8
    }

    pub fn set_awake(&mut self, awake: bool) {
        if awake {
            self.0 |= Self::AWAKE;
        } else {
            self.0 &= !Self::AWAKE;
        }
    }

    pub fn set_immortal(&mut self, immortal: bool) {
        if immortal {
            self.0 |= Self::IMMORTAL;
        } else {
            self.0 &= !Self::IMMORTAL;
        }
    }

    pub fn set_attack_buff(&mut self, attack_buff: u8) {
        self.0 = (self.0 & !(0xFF << Self::BUFF_SHIFT))
            | ((attack_buff as u32) << Self::BUFF_SHIFT);
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
#[repr(u8)]
pub enum Phase {
    #[default]
    Main,
    Materialize,
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
#[repr(u8)]
pub enum Weapon {
    #[default]
    None,
    ImpactHammer,
    MercenaryBlade,
    VaruckanSoulknife,
}

impl Weapon {
    pub const fn name(self) -> &'static str {
        match self {
            Self::None => "No Weapon",
            Self::ImpactHammer => "Impact Hammer",
            Self::MercenaryBlade => "Mercenary's Blade",
            Self::VaruckanSoulknife => "Varuckan Soulknife",
        }
    }

    pub const fn power(self) -> u8 {
        match self {
            Self::None => 0,
            Self::ImpactHammer => 2,
            Self::MercenaryBlade | Self::VaruckanSoulknife => 1,
        }
    }

    pub const fn durability(self) -> u8 {
        match self {
            Self::None => 0,
            Self::ImpactHammer => 2,
            Self::MercenaryBlade | Self::VaruckanSoulknife => 1,
        }
    }
}

/// Search board position. Memo keys hash/compare all fields except `damage`,
/// `queue`, and `queue_len` (the draw queue is constant within one solve).
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct State {
    pub hand: [u8; CARD_COUNT],
    pub memory: [u8; CARD_COUNT],
    pub hand_len: u8,
    pub memory_len: u8,
    pub allies: [Ally; 10],
    pub ally_len: u8,
    pub turn: u8,
    pub max_turns: u8,
    pub phase: Phase,
    pub damage: u8,
    pub fire_gy: u8,
    pub float_gy: u8,
    pub gy_total: u8,
    pub march_hare_gy: u8,
    pub champion_level: u8,
    pub champion_awake: bool,
    pub champion_damaged: bool,
    pub prep: u8,
    pub agility: u8,
    pub weapon: Weapon,
    pub weapon_durability: u8,
    pub dagger: bool,
    pub dagger_ready: bool,
    pub amplify: bool,
    pub materials: u8,
    /// Hot Cake items currently on the field.
    pub hot_cake: u8,
    pub go_first: bool,
    pub queue_pos: u8,
    /// Fixed upcoming draws for Monte Carlo / oracle passes. Empty ⇒ fire bricks.
    pub queue: [u8; DRAW_QUEUE_CAP],
    pub queue_len: u8,
}

impl PartialEq for State {
    fn eq(&self, other: &Self) -> bool {
        self.memo_key_eq(other)
    }
}

impl Eq for State {}

impl Hash for State {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.hash_memo_key(state);
    }
}

impl State {
    pub fn new(hand: &[Card], go_first: bool, max_turns: u8) -> Self {
        Self::with_queue(hand, go_first, max_turns, &[])
    }

    pub fn with_queue(hand: &[Card], go_first: bool, max_turns: u8, queue: &[Card]) -> Self {
        let mut counts = [0_u8; CARD_COUNT];
        for &card in hand {
            counts[card.index()] = counts[card.index()].saturating_add(1);
        }
        let mut draw_queue = [0_u8; DRAW_QUEUE_CAP];
        let queue_len = queue.len().min(DRAW_QUEUE_CAP) as u8;
        for (index, &card) in queue.iter().take(queue_len as usize).enumerate() {
            draw_queue[index] = card as u8;
        }
        Self {
            hand: counts,
            memory: [0; CARD_COUNT],
            hand_len: hand.len() as u8,
            memory_len: 0,
            allies: [Ally::default(); 10],
            ally_len: 0,
            turn: 0,
            max_turns,
            phase: Phase::Main,
            damage: 0,
            fire_gy: 0,
            float_gy: 0,
            gy_total: 0,
            march_hare_gy: 0,
            champion_level: 0,
            champion_awake: true,
            champion_damaged: false,
            prep: 0,
            agility: 0,
            weapon: Weapon::None,
            weapon_durability: 0,
            dagger: false,
            dagger_ready: false,
            amplify: false,
            materials: ALL_MATERIALS,
            hot_cake: 0,
            go_first,
            queue_pos: 0,
            queue: draw_queue,
            queue_len,
        }
    }

    fn memo_key_eq(&self, other: &Self) -> bool {
        self.hand == other.hand
            && self.memory == other.memory
            && self.hand_len == other.hand_len
            && self.memory_len == other.memory_len
            && self.allies == other.allies
            && self.ally_len == other.ally_len
            && self.turn == other.turn
            && self.max_turns == other.max_turns
            && self.phase == other.phase
            && self.fire_gy == other.fire_gy
            && self.float_gy == other.float_gy
            && self.gy_total == other.gy_total
            && self.march_hare_gy == other.march_hare_gy
            && self.champion_level == other.champion_level
            && self.champion_awake == other.champion_awake
            && self.champion_damaged == other.champion_damaged
            && self.prep == other.prep
            && self.agility == other.agility
            && self.weapon == other.weapon
            && self.weapon_durability == other.weapon_durability
            && self.dagger == other.dagger
            && self.dagger_ready == other.dagger_ready
            && self.amplify == other.amplify
            && self.materials == other.materials
            && self.hot_cake == other.hot_cake
            && self.go_first == other.go_first
            && self.queue_pos == other.queue_pos
    }

    fn hash_memo_key<H: Hasher>(&self, state: &mut H) {
        self.hand.hash(state);
        self.memory.hash(state);
        self.hand_len.hash(state);
        self.memory_len.hash(state);
        self.allies.hash(state);
        self.ally_len.hash(state);
        self.turn.hash(state);
        self.max_turns.hash(state);
        self.phase.hash(state);
        self.fire_gy.hash(state);
        self.float_gy.hash(state);
        self.gy_total.hash(state);
        self.march_hare_gy.hash(state);
        self.champion_level.hash(state);
        self.champion_awake.hash(state);
        self.champion_damaged.hash(state);
        self.prep.hash(state);
        self.agility.hash(state);
        self.weapon.hash(state);
        self.weapon_durability.hash(state);
        self.dagger.hash(state);
        self.dagger_ready.hash(state);
        self.amplify.hash(state);
        self.materials.hash(state);
        self.hot_cake.hash(state);
        self.go_first.hash(state);
        self.queue_pos.hash(state);
    }

    #[inline]
    pub const fn is_terminal(self) -> bool {
        self.turn >= self.max_turns
    }

    /// Cards left in hand plus memory (Rococo-style influence).
    #[inline]
    pub const fn influence(self) -> u8 {
        self.hand_len.saturating_add(self.memory_len)
    }

    #[inline]
    pub const fn is_assassin(self) -> bool {
        self.champion_level >= 1
    }

    #[inline]
    pub fn has(self, card: Card) -> bool {
        self.hand[card.index()] > 0
    }

    #[inline]
    pub fn has_material(self, material: u8) -> bool {
        self.materials & material != 0
    }

    #[inline]
    pub fn remove_material(&mut self, material: u8) -> bool {
        if !self.has_material(material) {
            return false;
        }
        self.materials &= !material;
        true
    }

    #[inline]
    pub fn add_damage(&mut self, base: u8) {
        self.damage = self
            .damage
            .saturating_add(base.saturating_add(u8::from(self.amplify && base > 0)));
    }

    pub fn remove_hand(&mut self, card: Card) -> bool {
        let slot = &mut self.hand[card.index()];
        if *slot == 0 {
            return false;
        }
        *slot -= 1;
        self.hand_len -= 1;
        true
    }

    pub fn add_hand(&mut self, card: Card) {
        self.hand[card.index()] = self.hand[card.index()].saturating_add(1);
        self.hand_len = self.hand_len.saturating_add(1);
    }

    pub fn send_to_gy(&mut self, card: Card) {
        self.gy_total = self.gy_total.saturating_add(1);
        if card.is_fire() {
            self.fire_gy = self.fire_gy.saturating_add(1);
        }
        if card.floating_memory() {
            self.float_gy = self.float_gy.saturating_add(1);
        }
        if card == Card::MarchHare {
            self.march_hare_gy = self.march_hare_gy.saturating_add(1);
        }
    }

    pub fn banish_fire_from_gy(&mut self, count: u8, prefer_march_hare: bool) -> u8 {
        let mut remaining = count.min(self.fire_gy);
        let mut marched = 0;
        if prefer_march_hare {
            let use_march = remaining.min(self.march_hare_gy);
            self.march_hare_gy -= use_march;
            marched = use_march;
            remaining -= use_march;
            self.fire_gy -= use_march;
            self.gy_total = self.gy_total.saturating_sub(use_march);
        }
        self.fire_gy = self.fire_gy.saturating_sub(remaining);
        self.gy_total = self.gy_total.saturating_sub(remaining);
        // Prefer not to desync march_hare_gy if we banished non-March fire while March remains.
        if self.march_hare_gy > self.fire_gy {
            self.march_hare_gy = self.fire_gy;
        }
        marched
    }

    pub fn fire_hand_count(self) -> u8 {
        let mut total = 0_u8;
        for card in ALL_CARDS {
            if card.is_fire() {
                total = total.saturating_add(self.hand[card.index()]);
            }
        }
        total
    }

    pub fn non_fire_hand_count(self) -> u8 {
        self.hand_len.saturating_sub(self.fire_hand_count())
    }

    pub fn pay_reserve(&mut self, cost: u8) -> bool {
        self.pay_reserve_with(cost, PaymentMode::Default).is_some()
    }

    /// Reserve cost using only Fire cards (for Imbue).
    pub fn pay_reserve_fire_only(&mut self, cost: u8) -> bool {
        self.pay_reserve_with(cost, PaymentMode::FireOnly).is_some()
    }

    /// Pays reserve. Returns `Some(all_fire)` when successful (`all_fire` = every reserved card is Fire).
    fn pay_reserve_with(&mut self, cost: u8, mode: PaymentMode) -> Option<bool> {
        if self.hand_len < cost {
            return None;
        }
        if mode == PaymentMode::FireOnly && self.fire_hand_count() < cost {
            return None;
        }
        let snapshot = *self;
        let mut selected = [0_u8; CARD_COUNT];
        for _ in 0..cost {
            let card = snapshot.best_payment_with_selected(&selected, mode)?;
            selected[card.index()] += 1;
        }
        let mut all_fire = true;
        for card in ALL_CARDS {
            let count = selected[card.index()];
            if count == 0 {
                continue;
            }
            if !card.is_fire() {
                all_fire = false;
            }
            self.hand[card.index()] -= count;
            self.memory[card.index()] += count;
            self.hand_len -= count;
            self.memory_len += count;
        }
        Some(all_fire || cost == 0)
    }

    pub fn pay_with_kindle(&mut self, cost: u8, kindle: u8) -> bool {
        self.pay_with_kindle_with(cost, kindle, PaymentMode::Default)
            .is_some()
    }

    pub fn pay_with_kindle_fire_only(&mut self, cost: u8, kindle: u8) -> bool {
        self.pay_with_kindle_with(cost, kindle, PaymentMode::FireOnly)
            .is_some()
    }

    /// Pays reserve/kindle for an Imbue N action.
    /// `force_fire` uses Fire-only payment (the explicit imbue line).
    /// Returns whether the card is imbued after payment.
    pub fn pay_imbue_cost(&mut self, cost: u8, imbue_n: u8, kindle: u8, force_fire: bool) -> bool {
        let kindle_capped = kindle.min(cost).min(self.fire_gy);
        let reserve = cost.saturating_sub(kindle_capped);
        if imbue_n == 0 {
            let _ = self.pay_with_kindle(cost, kindle);
            return false;
        }
        if force_fire {
            let _ = self.pay_with_kindle_fire_only(cost, kindle);
            return reserve >= imbue_n;
        }
        let all_fire = self
            .pay_with_kindle_with(cost, kindle, PaymentMode::Default)
            .unwrap_or(false);
        reserve >= imbue_n && all_fire
    }

    /// Pays with kindle. Returns `Some(reserve_all_fire)` on success.
    fn pay_with_kindle_with(
        &mut self,
        cost: u8,
        kindle: u8,
        mode: PaymentMode,
    ) -> Option<bool> {
        let kindle = kindle.min(cost).min(self.fire_gy);
        let reserve = cost.saturating_sub(kindle);
        let all_fire = self.pay_reserve_with(reserve, mode)?;
        let marched = self.banish_fire_from_gy(kindle, true);
        for _ in 0..marched {
            let already = self.allies[..self.ally_len as usize]
                .iter()
                .any(|ally| ally.card() == Card::MarchHare);
            if !already {
                self.add_ally(Card::MarchHare, true, false);
            }
        }
        Some(all_fire)
    }

    fn best_payment_with_selected(
        self,
        selected: &[u8; CARD_COUNT],
        mode: PaymentMode,
    ) -> Option<Card> {
        ALL_CARDS
            .iter()
            .copied()
            .filter(|card| self.hand[card.index()] > selected[card.index()])
            .filter(|card| mode != PaymentMode::FireOnly || card.is_fire())
            .max_by_key(|&card| self.payment_score(card))
    }

    fn payment_score(self, card: Card) -> i16 {
        let mut score = match card {
            Card::Brick => 100,
            Card::IgnitedStab | Card::RendingFlames | Card::HeatedVengeance => 10,
            Card::HastyMessenger | Card::MarkTheTarget | Card::PlantedExplosive => 3,
            Card::KingdomInformant => 2,
            Card::SableRemnant | Card::Arthur | Card::Sadi => 1,
            _ => 0,
        };
        if card.is_unique() && self.hand[card.index()] > 1 {
            score += 20;
        }
        score
    }

    pub fn add_ally(&mut self, card: Card, awake: bool, immortal: bool) {
        let index = self.ally_len as usize;
        if index >= self.allies.len() {
            return;
        }
        self.allies[index] = Ally::new(card, awake, immortal, 0);
        self.ally_len += 1;
    }

    pub fn remove_ally(&mut self, index: usize, to_gy: bool) -> Option<Card> {
        if index >= self.ally_len as usize {
            return None;
        }
        let removed = self.allies[index];
        let card = removed.card();
        if to_gy {
            self.send_to_gy(card);
            let death = card.on_death_damage();
            if death > 0 {
                self.add_damage(death);
                // On Death hits each champion (self + opponent).
                self.champion_damaged = true;
            }
        }
        let len = self.ally_len as usize;
        self.allies.copy_within(index + 1..len, index);
        self.allies[len - 1] = Ally::default();
        self.ally_len -= 1;
        Some(card)
    }

    pub fn arthur_rested(self) -> bool {
        self.allies[..self.ally_len as usize]
            .iter()
            .any(|ally| ally.card() == Card::Arthur && !ally.awake())
    }

    pub fn has_arthur(self) -> bool {
        self.allies[..self.ally_len as usize]
            .iter()
            .any(|ally| ally.card() == Card::Arthur)
    }

    /// Stealth for cull: innate stealth, or Assassin class stealth once Zander has leveled.
    /// Not turn-gated — Tweedledum is culled on any turn while `champion_level == 0`.
    pub fn ally_has_stealth(self, ally: Ally) -> bool {
        let card = ally.card();
        card.is_stealth() || (card.assassin_stealth() && self.is_assassin())
    }

    pub fn ally_power(self, ally: Ally) -> u8 {
        let card = ally.card();
        if card == Card::RedHare && !self.has_arthur() && self.champion_level < 3 {
            return 0;
        }
        let mut power = card.power();
        if card == Card::SableRemnant && self.is_assassin() {
            power += 1;
        }
        if card == Card::CaptivatingCutthroat && self.is_assassin() {
            power += 1;
        }
        if card != Card::Arthur && self.arthur_rested() {
            power += 1;
        }
        power
    }

    pub fn can_ally_attack(self, index: usize) -> bool {
        let ally = self.allies[index];
        ally.awake() && !(self.go_first && self.turn == 0) && self.ally_power(ally) > 0
    }

    pub fn draw_brick(&mut self) {
        self.add_hand(Card::Brick);
    }

    /// Unknown deck draw: next queued card, or a fire brick when the queue is empty.
    pub fn draw_unknown(&mut self) -> Card {
        if self.queue_pos < self.queue_len {
            let card = ALL_CARDS[self.queue[self.queue_pos as usize] as usize];
            self.queue_pos += 1;
            self.add_hand(card);
            card
        } else {
            self.draw_brick();
            Card::Brick
        }
    }

    pub fn discard_brick(&mut self) -> bool {
        if !self.remove_hand(Card::Brick) {
            return false;
        }
        self.send_to_gy(Card::Brick);
        true
    }

    /// Discard for on-attack / on-hit effects. Prefers bricks, else a payment-fodder card.
    pub fn discard_for_effect(&mut self) -> Option<Card> {
        if self.discard_brick() {
            return Some(Card::Brick);
        }
        let snapshot = *self;
        let selected = [0_u8; CARD_COUNT];
        let card = snapshot.best_payment_with_selected(&selected, PaymentMode::Default)?;
        self.remove_hand(card);
        self.send_to_gy(card);
        Some(card)
    }

    pub fn recollect(&mut self) -> Card {
        for card in ALL_CARDS {
            let count = self.memory[card.index()];
            self.hand[card.index()] = self.hand[card.index()].saturating_add(count);
            self.memory[card.index()] = 0;
        }
        self.hand_len = self.hand_len.saturating_add(self.memory_len);
        self.memory_len = 0;
        self.draw_unknown()
    }

    pub fn wake(&mut self) {
        self.champion_awake = true;
        self.champion_damaged = false;
        for ally in &mut self.allies[..self.ally_len as usize] {
            ally.set_awake(true);
            ally.set_immortal(false);
            ally.set_attack_buff(0);
        }
        if self.dagger {
            self.dagger_ready = true;
        }
        self.amplify = false;
        self.agility = 0;
    }

    pub fn enemy_cull(&mut self, mut steps: Option<&mut Vec<Step>>) {
        let mut index = 0;
        while index < self.ally_len as usize {
            let ally = self.allies[index];
            if ally.immortal() || self.ally_has_stealth(ally) {
                index += 1;
            } else if let Some(card) = self.remove_ally(index, true) {
                if let Some(steps) = steps.as_deref_mut() {
                    if card.on_death_damage() > 0 {
                        steps.push(Step::new(
                            *self,
                            "EMai",
                            format!("{} On Death", card.name()),
                        ));
                    }
                }
            }
        }
    }

    pub fn consume_weapon(&mut self) {
        if self.weapon == Weapon::None {
            return;
        }
        self.weapon_durability = self.weapon_durability.saturating_sub(1);
        if self.weapon_durability == 0 {
            self.weapon = Weapon::None;
        }
    }

    pub fn hand_display(self) -> String {
        let cards = ALL_CARDS
            .iter()
            .flat_map(|&card| std::iter::repeat_n(card.short(), self.hand[card.index()] as usize))
            .collect::<Vec<_>>();
        if cards.is_empty() {
            "HAND0".to_string()
        } else {
            format!("HAND{} {}", self.hand_len, cards.join(", "))
        }
    }

    pub fn memory_display(self) -> String {
        let cards = ALL_CARDS
            .iter()
            .flat_map(|&card| std::iter::repeat_n(card.short(), self.memory[card.index()] as usize))
            .collect::<Vec<_>>();
        if cards.is_empty() {
            "MEM0".to_string()
        } else {
            format!("MEM{} {}", self.memory_len, cards.join(", "))
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Action {
    Pass,
    SkipMaterialize,
    MaterializeHammer,
    MaterializeDagger,
    MaterializeZanderMemory,
    MaterializeZanderFloat(u8),
    MaterializeSoulknife,
    ActivateDagger,
    ActivateSadi(u8),
    AttackArthur(u8),
    AttackOthers,
    PlayAlly {
        card: Card,
        kindle: u8,
        sacrifice: bool,
        hot_cake_sacrifice: bool,
    },
    PlayItem {
        card: Card,
    },
    PlayAttack {
        card: Card,
        weapon: bool,
        prepared: bool,
        doubled: bool,
        /// Automaton ally index for Command Automaton attacks.
        command_ally: Option<u8>,
    },
    PlayAction {
        card: Card,
        kindle: u8,
        prepared: bool,
    /// For Imbue cards: pay Fire-only (guarantees imbue when legal).
    /// When false, use normal reserve payment and imbue only if that payment is all Fire.
    imbue: bool,
    },
    BlazingThrow,
    MercenaryBlade,
    /// Champion declares an attack by wielding the equipped weapon (no attack card).
    AttackWithWeapon,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct Step {
    pub turn: u8,
    pub phase: &'static str,
    pub damage: u8,
    pub allies: u8,
    pub ally_names: Vec<&'static str>,
    pub fire_gy: u8,
    pub action: String,
    pub memory: String,
    pub hand: String,
    pub display: String,
}

impl Step {
    pub fn new(state: State, phase: &'static str, action: impl Into<String>) -> Self {
        let action = action.into();
        let memory = state.memory_display();
        let hand = state.hand_display();
        let ally_names = state.allies[..state.ally_len as usize]
            .iter()
            .map(|ally| ally.card().name())
            .collect();
        let display = format!(
            "{} {:<4} | {:>3} | allies={} | FireGY {} | {:<42} | {:<34} | {}",
            state.turn, phase, state.damage, state.ally_len, state.fire_gy, action, memory, hand
        );
        Self {
            turn: state.turn,
            phase,
            damage: state.damage,
            allies: state.ally_len,
            ally_names,
            fire_gy: state.fire_gy,
            action,
            memory,
            hand,
            display,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct Bounds {
    pub min: u8,
    pub max: u8,
}

/// Post-clamp inputs that actually ran, for durable persistence and cross-run grouping.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct EffectiveRequest {
    pub engine_version: EngineVersion,
    pub root_seed: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sim_type: Option<SimType>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub deck: BTreeMap<String, u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub go_first: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_turns: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollouts: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub samples: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(type = "string | null"))]
    pub metric: Option<&'static str>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub bounds: BTreeMap<String, Bounds>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_size: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decks: Option<u32>,
    pub budget: Budget,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct SolveRequest {
    pub hand: Vec<String>,
    #[serde(default = "default_true")]
    pub go_first: bool,
    #[serde(default = "default_turns")]
    pub max_turns: u8,
    #[serde(default)]
    pub sim_type: SimType,
    /// Full maindeck counts. Required for Monte Carlo and Two-pass (minus the opening hand).
    #[serde(default)]
    pub deck: BTreeMap<String, u8>,
    #[serde(default = "default_rollouts")]
    pub rollouts: u16,
    #[serde(default = "default_seed")]
    pub seed: u64,
    #[serde(default)]
    pub budget: Budget,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum SimType {
    #[default]
    FireBrick,
    MonteCarlo,
    TwoPass,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct PassResult {
    pub max_damage: u8,
    /// Final hand + memory size on the chosen max-damage line.
    pub end_influence: u8,
    pub steps: Vec<Step>,
    pub nodes: u64,
    pub memo_entries: usize,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct McRollout {
    pub damage: u8,
    pub steps: Vec<Step>,
    pub nodes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct DamageDistribution {
    pub damages: Vec<u8>,
    pub mean: f64,
    pub p50: u8,
    pub p90: u8,
    pub min: u8,
    pub max: u8,
    pub rollouts: Vec<McRollout>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct TwoPassResult {
    pub brick: PassResult,
    pub oracle: PassResult,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct SolveResult {
    pub sim_type: SimType,
    pub max_damage: u8,
    /// Final hand + memory size on the chosen max-damage line.
    pub end_influence: u8,
    pub steps: Vec<Step>,
    pub nodes: u64,
    pub memo_entries: usize,
    pub elapsed_ms: f64,
    pub effective: EffectiveRequest,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distribution: Option<DamageDistribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_pass: Option<TwoPassResult>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
    /// Raw line counters for the headline / oracle path (skipped in JSON).
    #[serde(skip)]
    #[cfg_attr(feature = "ts", ts(skip))]
    pub line_stats: crate::stats::LineCardStats,
    /// Brick-pass line counters for two-pass (skipped in JSON).
    #[serde(skip)]
    #[cfg_attr(feature = "ts", ts(skip))]
    pub brick_line_stats: Option<crate::stats::LineCardStats>,
}

const fn default_true() -> bool {
    true
}

const fn default_turns() -> u8 {
    3
}

const fn default_rollouts() -> u16 {
    12
}

const fn default_seed() -> u64 {
    42
}
