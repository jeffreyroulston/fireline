use crate::budget::Budget;
use crate::cards::{ALL_CARDS, CARD_COUNT, Card};
use crate::version::{ENGINE_VERSION, EngineVersion};
use serde::{Deserialize, Serialize};

#[cfg(feature = "ts")]
use ts_rs::TS;

use std::collections::BTreeMap;
use std::hash::{Hash, Hasher};

pub const MAT_HAMMER: u16 = 1 << 0;
pub const MAT_BLADE: u16 = 1 << 1;
pub const MAT_DAGGER: u16 = 1 << 2;
pub const MAT_ZANDER: u16 = 1 << 3;
pub const MAT_SOULKNIFE: u16 = 1 << 4;
pub const MAT_TRISTAN: u16 = 1 << 5;
pub const MAT_ZANDER_2: u16 = 1 << 6;
pub const MAT_RIPPER: u16 = 1 << 7;
pub const MAT_RING: u16 = 1 << 8;
pub const ALL_MATERIALS: u16 = MAT_HAMMER | MAT_BLADE | MAT_DAGGER | MAT_ZANDER | MAT_SOULKNIFE;
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
    /// Granted stealth until end of turn (Corhazi Arsonist activation).
    const STEALTH: u32 = 1 << 10;
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
    pub fn stealth(self) -> bool {
        self.0 & Self::STEALTH != 0
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

    pub fn set_stealth(&mut self, stealth: bool) {
        if stealth {
            self.0 |= Self::STEALTH;
        } else {
            self.0 &= !Self::STEALTH;
        }
    }

    pub fn set_attack_buff(&mut self, attack_buff: u8) {
        self.0 =
            (self.0 & !(0xFF << Self::BUFF_SHIFT)) | ((attack_buff as u32) << Self::BUFF_SHIFT);
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
#[repr(u8)]
pub enum Phase {
    #[default]
    Main,
    Materialize,
    Agility,
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
#[repr(u8)]
pub enum Weapon {
    #[default]
    None,
    ImpactHammer,
    MercenaryBlade,
    VaruckanSoulknife,
    AssassinsRipper,
}

impl Weapon {
    pub const fn name(self) -> &'static str {
        match self {
            Self::None => "No Weapon",
            Self::ImpactHammer => "Impact Hammer",
            Self::MercenaryBlade => "Mercenary's Blade",
            Self::VaruckanSoulknife => "Varuckan Soulknife",
            Self::AssassinsRipper => "Assassin's Ripper",
        }
    }

    pub const fn power(self) -> u8 {
        match self {
            Self::None => 0,
            Self::ImpactHammer => 2,
            Self::MercenaryBlade | Self::VaruckanSoulknife | Self::AssassinsRipper => 1,
        }
    }

    pub const fn durability(self) -> u8 {
        match self {
            Self::None => 0,
            Self::ImpactHammer | Self::AssassinsRipper => 2,
            Self::MercenaryBlade | Self::VaruckanSoulknife => 1,
        }
    }

    pub const fn power_with_bonus(self, bonus: u8) -> u8 {
        self.power().saturating_add(bonus)
    }

    pub const fn slot(self) -> Option<usize> {
        match self {
            Self::None => None,
            Self::ImpactHammer => Some(0),
            Self::MercenaryBlade => Some(1),
            Self::VaruckanSoulknife => Some(2),
            Self::AssassinsRipper => Some(3),
        }
    }

    pub const fn from_slot(slot: usize) -> Self {
        match slot {
            0 => Self::ImpactHammer,
            1 => Self::MercenaryBlade,
            2 => Self::VaruckanSoulknife,
            _ => Self::AssassinsRipper,
        }
    }

    pub const EQUIPPABLE: [Self; 4] = [
        Self::ImpactHammer,
        Self::MercenaryBlade,
        Self::VaruckanSoulknife,
        Self::AssassinsRipper,
    ];
}

pub const WEAPON_COUNT: usize = 4;

/// Generates `State` together with its `PartialEq`/`Hash` impls from a single
/// field list, so the search memo key can never drift out of sync with the
/// struct: every listed field is hashed and compared.
///
/// Excluded from the key: `damage` (the memo stores the best *additional*
/// damage from a position) and the consumed draw-queue prefix (only
/// `queue[queue_pos..queue_len]` distinguishes positions).
macro_rules! define_state {
    ($($(#[$meta:meta])* $field:ident : $ty:ty),* $(,)?) => {
        /// Search board position. See `define_state!` for the memo-key contract.
        #[repr(C)]
        #[derive(Clone, Copy, Debug)]
        pub struct State {
            $($(#[$meta])* pub $field: $ty,)*
            pub damage: u8,
            /// Fixed upcoming draws for Monte Carlo / oracle passes. Empty ⇒ fire bricks.
            pub queue: [u8; DRAW_QUEUE_CAP],
            pub queue_len: u8,
        }

        impl PartialEq for State {
            fn eq(&self, other: &Self) -> bool {
                $(self.$field == other.$field &&)* self.queue_suffix_eq(other)
            }
        }

        impl Eq for State {}

        impl Hash for State {
            fn hash<H: Hasher>(&self, state: &mut H) {
                $(self.$field.hash(state);)*
                let pos = self.queue_pos as usize;
                let len = self.queue_len as usize;
                for index in pos..len {
                    self.queue[index].hash(state);
                }
            }
        }
    };
}

define_state! {
    hand: [u8; CARD_COUNT],
    memory: [u8; CARD_COUNT],
    hand_len: u8,
    memory_len: u8,
    allies: [Ally; 10],
    ally_len: u8,
    turn: u8,
    max_turns: u8,
    phase: Phase,
    fire_gy: u8,
    float_gy: u8,
    gy_total: u8,
    march_hare_gy: u8,
    /// Per-card graveyard counts (for Zander level-2 returns and precise banish).
    gy: [u8; CARD_COUNT],
    champion_level: u8,
    /// Tristan, Underhanded has leveled (agility recollect + fast activations at end of turn).
    tristan_leveled: bool,
    champion_awake: bool,
    champion_damaged: bool,
    prep: u8,
    agility: u8,
    /// Durability per weapon type on field (0 = not equipped). [Hammer, Blade, Soulknife, Ripper].
    weapons: [u8; WEAPON_COUNT],
    /// Assassin's Ripper class bonus (+2 power until end of turn when attacking with Ripper).
    weapon_power_bonus: u8,
    dagger: bool,
    dagger_ready: bool,
    /// Grand Crusader's Ring materialized and on field (must banish from here, not the deck).
    ring: bool,
    amplify: bool,
    materials: u16,
    /// Hot Cake items currently on the field.
    hot_cake: u8,
    go_first: bool,
    queue_pos: u8,
}

impl State {
    pub fn new(hand: &[Card], go_first: bool, max_turns: u8) -> Self {
        Self::with_queue(hand, go_first, max_turns, &[])
    }

    pub fn with_queue(hand: &[Card], go_first: bool, max_turns: u8, queue: &[Card]) -> Self {
        Self::with_queue_and_materials(hand, go_first, max_turns, queue, ALL_MATERIALS)
    }

    pub fn with_queue_and_materials(
        hand: &[Card],
        go_first: bool,
        max_turns: u8,
        queue: &[Card],
        materials: u16,
    ) -> Self {
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
            gy: [0; CARD_COUNT],
            champion_level: 0,
            tristan_leveled: false,
            champion_awake: true,
            champion_damaged: false,
            prep: 0,
            agility: 0,
            weapons: [0; WEAPON_COUNT],
            weapon_power_bonus: 0,
            dagger: false,
            dagger_ready: false,
            ring: false,
            amplify: false,
            materials,
            hot_cake: 0,
            go_first,
            queue_pos: 0,
            queue: draw_queue,
            queue_len,
        }
    }

    fn queue_suffix_eq(&self, other: &Self) -> bool {
        let pos = self.queue_pos as usize;
        let len = self.queue_len as usize;
        let other_pos = other.queue_pos as usize;
        let other_len = other.queue_len as usize;
        if len - pos != other_len - other_pos {
            return false;
        }
        for index in 0..(len - pos) {
            if self.queue[pos + index] != other.queue[pos + index] {
                return false;
            }
        }
        true
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
    pub fn has_material(self, material: u16) -> bool {
        self.materials & material != 0
    }

    #[inline]
    pub fn remove_material(&mut self, material: u16) -> bool {
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
        self.gy[card.index()] = self.gy[card.index()].saturating_add(1);
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

    pub fn gy_count(self, card: Card) -> u8 {
        self.gy[card.index()]
    }

    pub fn remove_one_from_gy(&mut self, card: Card) -> bool {
        if self.gy[card.index()] == 0 {
            return false;
        }
        self.gy[card.index()] -= 1;
        self.gy_total = self.gy_total.saturating_sub(1);
        if card.is_fire() {
            self.fire_gy = self.fire_gy.saturating_sub(1);
        }
        if card.floating_memory() {
            self.float_gy = self.float_gy.saturating_sub(1);
        }
        if card == Card::MarchHare {
            self.march_hare_gy = self.march_hare_gy.saturating_sub(1);
        }
        true
    }

    pub fn banish_fire_from_gy(&mut self, count: u8, prefer_march_hare: bool) -> u8 {
        let mut remaining = count.min(self.fire_gy);
        let mut marched = 0_u8;
        if prefer_march_hare {
            let use_march = remaining.min(self.gy[Card::MarchHare.index()]);
            for _ in 0..use_march {
                self.remove_one_from_gy(Card::MarchHare);
            }
            marched = use_march;
            remaining = remaining.saturating_sub(use_march);
        }
        while remaining > 0 {
            let Some(card) = ALL_CARDS
                .iter()
                .copied()
                .find(|&card| card.is_fire() && self.gy[card.index()] > 0)
            else {
                break;
            };
            self.remove_one_from_gy(card);
            remaining -= 1;
        }
        marched
    }

    /// Banish one floating-memory card from the graveyard (Zander memory cost).
    pub fn banish_floating_memory_from_gy(&mut self) {
        if self.float_gy == 0 {
            return;
        }
        let Some(card) = ALL_CARDS
            .iter()
            .copied()
            .find(|&card| card.floating_memory() && self.gy[card.index()] > 0)
        else {
            return;
        };
        self.remove_one_from_gy(card);
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
    fn pay_with_kindle_with(&mut self, cost: u8, kindle: u8, mode: PaymentMode) -> Option<bool> {
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

    /// Stealth for cull: innate stealth, Assassin class stealth once Zander has leveled,
    /// a granted stealth-until-end-of-turn buff, or Lurking Assailant while awake.
    /// Not turn-gated — Tweedledum is culled on any turn while `champion_level == 0`.
    pub fn ally_has_stealth(self, ally: Ally) -> bool {
        let card = ally.card();
        card.is_stealth()
            || (card.assassin_stealth() && self.is_assassin())
            || ally.stealth()
            || (card == Card::LurkingAssailant && ally.awake())
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
        // Balance: +3 while hand and memory hold the same number of cards.
        if card == Card::Gildas && self.hand_len == self.memory_len {
            power += 3;
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

    /// Draw a card straight into the memory zone (Increasing Danger).
    pub fn draw_to_memory(&mut self) -> Card {
        let card = if self.queue_pos < self.queue_len {
            let card = ALL_CARDS[self.queue[self.queue_pos as usize] as usize];
            self.queue_pos += 1;
            card
        } else {
            Card::Brick
        };
        self.memory[card.index()] = self.memory[card.index()].saturating_add(1);
        self.memory_len = self.memory_len.saturating_add(1);
        card
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

    /// Move up to `count` cards from memory to hand (highest reserve cost first).
    pub fn recollect_from_memory(&mut self, count: u8) -> Vec<Card> {
        let mut moved = Vec::with_capacity(count as usize);
        let mut remaining = count;
        while remaining > 0 && self.memory_len > 0 {
            let snapshot = *self;
            let card = ALL_CARDS
                .iter()
                .copied()
                .filter(|card| self.memory[card.index()] > 0)
                .max_by_key(|&card| snapshot.payment_score(card));
            if let Some(card) = card {
                self.memory[card.index()] -= 1;
                self.memory_len -= 1;
                self.hand[card.index()] = self.hand[card.index()].saturating_add(1);
                self.hand_len = self.hand_len.saturating_add(1);
                moved.push(card);
                remaining -= 1;
            } else {
                break;
            }
        }
        moved
    }

    /// Champion level-1 memory cost: floating memory from GY first, else banish from memory.
    /// Returns `true` when paid from the memory zone, `false` when paid via floating memory in GY.
    pub fn pay_champion_memory_cost(&mut self) -> bool {
        if self.float_gy > 0 {
            self.banish_floating_memory_from_gy();
            return false;
        }
        let snapshot = *self;
        let card = ALL_CARDS
            .iter()
            .copied()
            .filter(|card| self.memory[card.index()] > 0)
            .max_by_key(|&card| snapshot.payment_score(card));
        if let Some(card) = card {
            self.memory[card.index()] -= 1;
            self.memory_len -= 1;
            return true;
        }
        false
    }

    /// Pays Zander level-1 memory cost: floating memory from GY first, else banish from memory.
    pub fn pay_zander_memory_cost(&mut self) -> bool {
        self.pay_champion_memory_cost()
    }

    pub fn wake(&mut self) {
        self.champion_awake = true;
        self.champion_damaged = false;
        for ally in &mut self.allies[..self.ally_len as usize] {
            ally.set_awake(true);
            ally.set_immortal(false);
            ally.set_stealth(false);
            ally.set_attack_buff(0);
        }
        if self.dagger {
            self.dagger_ready = true;
        }
        self.amplify = false;
        self.weapon_power_bonus = 0;
        self.agility = 0;
    }

    pub fn enemy_cull(&mut self, mut tape: Option<&mut crate::line_event::EventTape>) {
        use crate::line_event::TapePhase;
        let mut index = 0;
        while index < self.ally_len as usize {
            let ally = self.allies[index];
            if ally.immortal() || self.ally_has_stealth(ally) {
                index += 1;
            } else if let Some(card) = self.remove_ally(index, true)
                && let Some(tape) = tape.as_deref_mut()
            {
                crate::line_event::push_ally_gy_death(self, card, TapePhase::EnemyMain, tape);
            }
        }
    }

    pub fn consume_weapon(&mut self, weapon: Weapon) {
        let Some(slot) = weapon.slot() else {
            return;
        };
        self.weapons[slot] = self.weapons[slot].saturating_sub(1);
    }

    pub fn equip_weapon(&mut self, weapon: Weapon) {
        let Some(slot) = weapon.slot() else {
            return;
        };
        self.weapons[slot] = weapon.durability();
    }

    pub fn remove_weapon(&mut self, weapon: Weapon) {
        if let Some(slot) = weapon.slot() {
            self.weapons[slot] = 0;
        }
    }

    pub fn has_weapon(self, weapon: Weapon) -> bool {
        weapon.slot().is_some_and(|slot| self.weapons[slot] > 0)
    }

    pub fn any_weapon(self) -> bool {
        self.weapons.iter().any(|&durability| durability > 0)
    }

    pub fn weapon_durability(self, weapon: Weapon) -> u8 {
        weapon.slot().map(|slot| self.weapons[slot]).unwrap_or(0)
    }

    pub fn weapon_power(self, weapon: Weapon) -> u8 {
        let bonus = u8::from(weapon == Weapon::AssassinsRipper) * self.weapon_power_bonus;
        weapon.power_with_bonus(bonus)
    }

    pub fn equipped_weapons(self) -> impl Iterator<Item = Weapon> {
        (0..WEAPON_COUNT)
            .filter(move |&slot| self.weapons[slot] > 0)
            .map(Weapon::from_slot)
    }

    /// Cards at the top of the remaining draw queue (up to 2) before a Glimpse.
    pub fn glimpse_peek(&self) -> Vec<Card> {
        let pos = self.queue_pos as usize;
        let len = self.queue_len as usize;
        if pos >= len {
            return Vec::new();
        }
        let glimpse_n = (len - pos).min(2);
        self.queue[pos..pos + glimpse_n]
            .iter()
            .map(|&raw| ALL_CARDS[raw as usize])
            .collect()
    }

    /// Number of distinct deck-tail orders after Glimpse min(2, remaining).
    pub fn glimpse_layout_count(self) -> u8 {
        Self::glimpse_tail_orders(self.queue, self.queue_pos as usize, self.queue_len as usize)
            .len() as u8
    }

    /// Reorder `queue[queue_pos..queue_len]` per a Glimpse layout index.
    pub fn apply_glimpse_layout(&mut self, layout: u8) {
        let pos = self.queue_pos as usize;
        let len = self.queue_len as usize;
        if pos >= len {
            return;
        }
        let orders = Self::glimpse_tail_orders(self.queue, pos, len);
        let index = layout.min(orders.len().saturating_sub(1) as u8) as usize;
        for (offset, &card) in orders[index].iter().enumerate() {
            self.queue[pos + offset] = card;
        }
    }

    fn glimpse_tail_orders(queue: [u8; DRAW_QUEUE_CAP], pos: usize, len: usize) -> Vec<Vec<u8>> {
        let tail_len = len - pos;
        if tail_len == 0 {
            return vec![Vec::new()];
        }
        let glimpse_n = tail_len.min(2);
        let glimpse: Vec<u8> = queue[pos..pos + glimpse_n].to_vec();
        let middle: Vec<u8> = queue[pos + glimpse_n..len].to_vec();
        let mut orders: Vec<Vec<u8>> = Vec::new();

        fn push_unique(orders: &mut Vec<Vec<u8>>, tail: Vec<u8>) {
            if !orders.iter().any(|existing| existing == &tail) {
                orders.push(tail);
            }
        }

        match glimpse_n {
            1 => {
                let c0 = glimpse[0];
                push_unique(&mut orders, {
                    let mut tail = vec![c0];
                    tail.extend_from_slice(&middle);
                    tail
                });
                push_unique(&mut orders, {
                    let mut tail = middle;
                    tail.push(c0);
                    tail
                });
            }
            2 => {
                let c0 = glimpse[0];
                let c1 = glimpse[1];
                push_unique(&mut orders, vec![c0, c1]);
                push_unique(&mut orders, vec![c1, c0]);
                push_unique(&mut orders, {
                    let mut tail = vec![c0];
                    tail.extend_from_slice(&middle);
                    tail.push(c1);
                    tail
                });
                push_unique(&mut orders, {
                    let mut tail = vec![c1];
                    tail.extend_from_slice(&middle);
                    tail.push(c0);
                    tail
                });
                push_unique(&mut orders, {
                    let mut tail = middle.clone();
                    tail.push(c0);
                    tail.push(c1);
                    tail
                });
                push_unique(&mut orders, {
                    let mut tail = middle;
                    tail.push(c1);
                    tail.push(c0);
                    tail
                });
            }
            _ => push_unique(&mut orders, queue[pos..len].to_vec()),
        }

        orders
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Action {
    Pass,
    SkipMaterialize,
    MaterializeHammer,
    MaterializeDagger,
    MaterializeZanderMemory {
        /// `Some(layout)` when oracle / Monte Carlo may reorder the deck tail via Glimpse 2.
        glimpse_layout: Option<u8>,
    },
    MaterializeTristanMemory {
        /// `Some(layout)` when oracle / Monte Carlo may reorder the deck tail via Glimpse 2.
        glimpse_layout: Option<u8>,
    },
    TristanRecollect,
    SkipAgility,
    MaterializeSoulknife,
    MaterializeRipper,
    MaterializeRing,
    ActivateDagger,
    ActivateRipper,
    ActivateSadi(u8),
    AttackArthur(u8),
    AttackOthers,
    PlayAlly {
        card: Card,
        kindle: u8,
        sacrifice: bool,
        hot_cake_sacrifice: bool,
        /// Material-deck champion leveled via Flagrant Guide on enter
        /// (`MAT_ZANDER`, `MAT_ZANDER_2`, or `MAT_TRISTAN`).
        flagrant_level: Option<u16>,
        /// Assassin action/attack returned from the graveyard when leveling to Deft Executor (−1 prep).
        flagrant_gy_return: Option<Card>,
    },
    PlayItem {
        card: Card,
    },
    PlayAttack {
        card: Card,
        /// Which equipped weapon to wield, if any.
        wield: Option<Weapon>,
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
        /// Ally index sacrificed as an additional cost (Undeniable Truth).
        sacrifice_ally: Option<u8>,
    },
    /// Corhazi Arsonist: remove a preparation counter to gain stealth until end of turn.
    ActivateArsonist(u8),
    BlazingThrow(Weapon),
    MercenaryBlade,
    BanishCrusaderRing,
    /// Champion declares an attack by wielding one equipped weapon (no attack card).
    AttackWithWeapon(Weapon),
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
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(type = "string | null"))]
    pub strategy: Option<&'static str>,
    pub budget: Budget,
}

impl Default for EffectiveRequest {
    fn default() -> Self {
        Self {
            engine_version: ENGINE_VERSION,
            root_seed: 0,
            sim_type: None,
            deck: BTreeMap::new(),
            go_first: None,
            max_turns: None,
            rollouts: None,
            samples: None,
            metric: None,
            bounds: BTreeMap::new(),
            deck_size: None,
            decks: None,
            strategy: None,
            budget: Budget::default(),
        }
    }
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
    /// Full maindeck counts. Required for Monte Carlo, Two-pass, and Oracle (minus the opening hand).
    #[serde(default)]
    pub deck: BTreeMap<String, u8>,
    /// Remaining library in draw order. When set, Two-pass and Oracle use this
    /// queue as-is instead of shuffling `deck` minus the hand.
    #[serde(default)]
    pub queue: Option<Vec<String>>,
    #[serde(default = "default_rollouts")]
    pub rollouts: u16,
    #[serde(default = "default_seed")]
    pub seed: u64,
    #[serde(default)]
    pub budget: Budget,
    /// Material sideboard counts. Empty → all default materials.
    #[serde(default)]
    pub materials: BTreeMap<String, u8>,
}

/// Map persisted material ids to the engine material bitmask.
pub fn resolve_materials_bitmask(counts: &BTreeMap<String, u8>) -> u16 {
    if counts.is_empty() {
        return ALL_MATERIALS;
    }
    let mut mask = 0_u16;
    for (id, qty) in counts {
        if *qty == 0 {
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
            _ => 0,
        };
    }
    if mask == 0 { ALL_MATERIALS } else { mask }
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
    OracleOnly,
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
    pub events: Vec<crate::line_event::LineEvent>,
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
    pub events: Vec<crate::line_event::LineEvent>,
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
    pub p10: u8,
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
    pub events: Vec<crate::line_event::LineEvent>,
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
    /// Sparse per-card counters for the headline line (persist → run_sample_card_stats).
    #[serde(skip_serializing_if = "crate::stats::SparseLineStats::is_empty_stats")]
    pub line_card_stats: crate::stats::SparseLineStats,
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
