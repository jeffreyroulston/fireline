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
    /// Temporary combat damage marks (cleared on wake / end of turn). Bits 11–15.
    const DAMAGE_SHIFT: u32 = 11;
    const DAMAGE_MASK: u32 = 0x1F << Self::DAMAGE_SHIFT;
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

    /// Temporary damage marked on this ally (combat / effects).
    #[inline]
    pub fn damage_marked(self) -> u8 {
        ((self.0 & Self::DAMAGE_MASK) >> Self::DAMAGE_SHIFT) as u8
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

    pub fn set_damage_marked(&mut self, damage: u8) {
        let capped = damage.min(31) as u32;
        self.0 = (self.0 & !Self::DAMAGE_MASK) | (capped << Self::DAMAGE_SHIFT);
    }

    pub fn add_damage_marked(&mut self, amount: u8) {
        self.set_damage_marked(self.damage_marked().saturating_add(amount));
    }

    pub fn clear_damage_marked(&mut self) {
        self.set_damage_marked(0);
    }

    pub fn set_attack_buff(&mut self, attack_buff: u8) {
        self.0 =
            (self.0 & !(0xFF << Self::BUFF_SHIFT)) | ((attack_buff as u32) << Self::BUFF_SHIFT);
    }

    #[inline]
    pub const fn raw(self) -> u32 {
        self.0
    }

    #[inline]
    pub const fn from_raw(raw: u32) -> Self {
        Self(raw)
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
#[repr(u8)]
pub enum Phase {
    #[default]
    Main,
    Materialize,
    Agility,
    PreRecollect,
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
    /// Cards removed from the game (graveyard or memory).
    banished: [u8; CARD_COUNT],
    banished_total: u8,
    /// Grand Crusader's Ring was banished from materials.
    ring_banished: bool,
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
            banished: [0; CARD_COUNT],
            banished_total: 0,
            ring_banished: false,
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

    /// Upper bound on **deck cards** this position can still pull onto the board
    /// (into hand or memory) from:
    /// 1. remaining Mate recollect draws (`recollect()` always `draw_unknown`s once),
    /// 2. draw engines currently in hand or memory (gated by rough playability),
    /// 3. board sources already in play (Crusader Ring; Hasty/Red Hare / Corhazi
    ///    attack draws when those allies can attack).
    ///
    /// Optimistic: counts each legal-looking engine once per copy without
    /// simulating payment contention between them. Not part of the memo key.
    pub fn draw_potential(self) -> u8 {
        self.recollect_draw_potential()
            .saturating_add(self.zone_draw_potential())
            .saturating_add(self.board_draw_potential())
    }

    /// Deck draws still owed by Mate exits: current Mate if still open, plus
    /// one per future turn (`max_turns - turn` windows left when in Mate).
    pub fn recollect_draw_potential(self) -> u8 {
        if self.is_terminal() {
            return 0;
        }
        match self.phase {
            Phase::Materialize | Phase::PreRecollect => self.max_turns.saturating_sub(self.turn),
            Phase::Main | Phase::Agility => {
                self.max_turns.saturating_sub(self.turn.saturating_add(1))
            }
        }
    }

    /// Draw engines sitting in hand or memory (memory becomes hand at recollect).
    fn zone_draw_potential(self) -> u8 {
        let mut total = 0_u8;
        for card in ALL_CARDS {
            let copies = self.hand[card.index()].saturating_add(self.memory[card.index()]);
            if copies == 0 {
                continue;
            }
            let per = self.deck_draws_if_played(card);
            if per == 0 {
                continue;
            }
            total = total.saturating_add(per.saturating_mul(copies));
        }
        total
    }

    /// How many deck cards one play of `card` would add, given current board
    /// (0 if the engine cannot fire in this state).
    fn deck_draws_if_played(self, card: Card) -> u8 {
        match card {
            Card::IncreasingDanger => {
                // Cost 2; need the card plus two reserve fodder somewhere in hand.
                // Memory copies are assumed available after the next recollect.
                if self.hand_len.saturating_add(self.memory_len) > 2 {
                    2
                } else {
                    0
                }
            }
            Card::UndeniableTruth => {
                // Cost 1 + sacrifice an ally.
                if self.ally_len > 0 && self.hand_len.saturating_add(self.memory_len) > 1 {
                    1
                } else {
                    0
                }
            }
            Card::VermilionDecree => {
                // Only the imbued path draws; need Fire available for imbue.
                if self.fire_gy > 0
                    || self.hand.iter().enumerate().any(|(i, &n)| {
                        n > 0 && ALL_CARDS[i].is_fire() && ALL_CARDS[i] != Card::VermilionDecree
                    })
                    || self
                        .memory
                        .iter()
                        .enumerate()
                        .any(|(i, &n)| n > 0 && ALL_CARDS[i].is_fire())
                {
                    1
                } else {
                    0
                }
            }
            Card::ClumsyApprentice => 1,
            // Cost 2; need one leftover hand card after paying to discard for the draw.
            Card::PackageCourier if self.hand_len > 3 => 1,
            Card::PackageCourier => 0,
            _ => 0,
        }
    }

    /// Draws already sitting on the board (not in hand/memory piles).
    fn board_draw_potential(self) -> u8 {
        let mut total = 0_u8;
        // Grand Crusader's Ring: while still in the material deck, each future
        // Mate window can materialize+banish it for a draw. It never sits on
        // the field waiting — banishing is folded into MaterializeRing.
        if self.has_material(MAT_RING) {
            total = total.saturating_add(self.recollect_draw_potential());
        }
        let can_attack = !(self.go_first && self.turn == 0);
        for index in 0..self.ally_len as usize {
            let ally = self.allies[index];
            if !can_attack || !ally.awake() {
                continue;
            }
            match ally.card() {
                Card::HastyMessenger | Card::RedHare => {
                    // On-attack discard+draw; need something to discard.
                    if self.hand_len > 0 {
                        total = total.saturating_add(1);
                    }
                }
                Card::CorhaziCourier if self.is_assassin() => {
                    total = total.saturating_add(1);
                }
                _ => {}
            }
        }
        total
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

    pub fn send_to_banish(&mut self, card: Card) {
        self.banished[card.index()] = self.banished[card.index()].saturating_add(1);
        self.banished_total = self.banished_total.saturating_add(1);
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
                self.send_to_banish(Card::MarchHare);
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
            self.send_to_banish(card);
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
        self.send_to_banish(card);
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

    /// Pay reserve by moving explicit cards from hand to memory.
    pub fn pay_reserve_selection(&mut self, cards: &[Card], fire_only: bool) -> Option<bool> {
        if cards.is_empty() {
            return Some(true);
        }
        if cards.len() > u8::MAX as usize || self.hand_len < cards.len() as u8 {
            return None;
        }
        let mut needed = [0_u8; CARD_COUNT];
        for &card in cards {
            needed[card.index()] = needed[card.index()].saturating_add(1);
        }
        for card in ALL_CARDS {
            if self.hand[card.index()] < needed[card.index()] {
                return None;
            }
        }
        if fire_only {
            for &card in cards {
                if !card.is_fire() {
                    return None;
                }
            }
        }
        let mut all_fire = true;
        for card in ALL_CARDS {
            let count = needed[card.index()];
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
        Some(all_fire)
    }

    /// Pay reserve + kindle using explicit reserve cards.
    pub fn pay_with_kindle_selection(
        &mut self,
        cost: u8,
        kindle: u8,
        reserved: &[Card],
        fire_only: bool,
    ) -> bool {
        let kindle = kindle.min(cost).min(self.fire_gy);
        let reserve = cost.saturating_sub(kindle);
        if reserved.len() != reserve as usize {
            return false;
        }
        let mode = if fire_only {
            PaymentMode::FireOnly
        } else {
            PaymentMode::Default
        };
        if self
            .pay_reserve_selection(reserved, mode == PaymentMode::FireOnly)
            .is_none()
        {
            return false;
        }
        let marched = self.banish_fire_from_gy(kindle, true);
        for _ in 0..marched {
            let already = self.allies[..self.ally_len as usize]
                .iter()
                .any(|ally| ally.card() == Card::MarchHare);
            if !already {
                self.add_ally(Card::MarchHare, true, false);
            }
        }
        true
    }

    /// Pay imbue cost using explicit reserve cards.
    pub fn pay_imbue_cost_selection(
        &mut self,
        cost: u8,
        imbue_n: u8,
        kindle: u8,
        force_fire: bool,
        reserved: &[Card],
    ) -> bool {
        let kindle_capped = kindle.min(cost).min(self.fire_gy);
        let reserve = cost.saturating_sub(kindle_capped);
        if imbue_n == 0 {
            return self.pay_with_kindle_selection(cost, kindle, reserved, force_fire);
        }
        if force_fire {
            if !self.pay_with_kindle_selection(cost, kindle, reserved, true) {
                return false;
            }
            return reserve >= imbue_n;
        }
        if reserved.len() != reserve as usize {
            return false;
        }
        let Some(all_fire) = self.pay_reserve_selection(reserved, false) else {
            return false;
        };
        let marched = self.banish_fire_from_gy(kindle_capped, true);
        for _ in 0..marched {
            let already = self.allies[..self.ally_len as usize]
                .iter()
                .any(|ally| ally.card() == Card::MarchHare);
            if !already {
                self.add_ally(Card::MarchHare, true, false);
            }
        }
        reserve >= imbue_n && all_fire
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
            .max_by_key(|&card| {
                let score = self.payment_score(card);
                let prefer_non_fire = mode == PaymentMode::Default && !card.is_fire();
                (score, prefer_non_fire)
            })
    }

    /// Greedy reserve order: Fire bricks, duplicate attacks, duplicate uniques
    /// (except Rococo), then everything else.
    fn payment_score(self, card: Card) -> i16 {
        if card == Card::Brick {
            return 100;
        }
        if card.is_attack() && self.hand[card.index()] > 1 {
            return 50;
        }
        if card.is_unique() && card != Card::Rococo && self.hand[card.index()] > 1 {
            return 30;
        }
        0
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

    /// Mark temporary combat damage on an ally. Destroys (to GY) when marks ≥ printed life
    /// unless immortal. Returns true if the ally was destroyed.
    pub fn mark_ally_damage(&mut self, index: usize, amount: u8) -> bool {
        if index >= self.ally_len as usize || amount == 0 {
            return false;
        }
        self.allies[index].add_damage_marked(amount);
        self.destroy_ally_if_lethal(index)
    }

    /// Destroy ally when damage marks meet or exceed printed life (immortal survives).
    pub fn destroy_ally_if_lethal(&mut self, index: usize) -> bool {
        if index >= self.ally_len as usize {
            return false;
        }
        let ally = self.allies[index];
        if ally.immortal() {
            return false;
        }
        let Some(life) = ally.card().life() else {
            return false;
        };
        if ally.damage_marked() < life {
            return false;
        }
        self.remove_ally(index, true).is_some()
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

    /// Expanded hand in stable card order (matches playtest hand indices).
    pub fn hand_slots(&self) -> Vec<Card> {
        let mut out = Vec::new();
        for card in ALL_CARDS {
            for _ in 0..self.hand[card.index()] {
                out.push(card);
            }
        }
        out
    }

    /// Discard the card at a hand slot index (playtest manual selection).
    pub fn discard_hand_slot(&mut self, index: u8) -> Option<Card> {
        let card = *self.hand_slots().get(index as usize)?;
        if !self.remove_hand(card) {
            return None;
        }
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
            self.send_to_banish(card);
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
            ally.clear_damage_marked();
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
    ///
    /// With two peeked cards the engine explores at most five layouts: both on
    /// top (two orders), one top / one bottom (two), and both on bottom once
    /// (original relative order — bottom order is not chosen separately).
    pub fn glimpse_layout_count(self) -> u8 {
        Self::glimpse_tail_orders(self.queue, self.queue_pos as usize, self.queue_len as usize)
            .len() as u8
    }

    /// Collapsed Glimpse layout indices keyed on the next [`draw_potential`] queue
    /// cards. Kept for regression tests; solver and playtest both explore
    /// [`glimpse_playtest_layouts`].
    pub fn glimpse_relevant_layouts(self) -> Vec<u8> {
        let draws = self.draw_potential();
        if draws == 0 || self.queue_pos >= self.queue_len {
            return Vec::new();
        }
        let orders =
            Self::glimpse_tail_orders(self.queue, self.queue_pos as usize, self.queue_len as usize);
        let prefix_len = usize::from(draws);
        let mut seen: Vec<Vec<u8>> = Vec::new();
        let mut indices = Vec::new();
        for (index, order) in orders.iter().enumerate() {
            let key: Vec<u8> = order.iter().copied().take(prefix_len).collect();
            if seen.iter().any(|existing| existing == &key) {
                continue;
            }
            seen.push(key);
            indices.push(index as u8);
        }
        indices
    }

    /// All Glimpse layout indices for interactive playtest (no draw-potential collapse).
    pub fn glimpse_playtest_layouts(self) -> Vec<u8> {
        if self.draw_potential() == 0 || self.queue_pos >= self.queue_len {
            return Vec::new();
        }
        (0..usize::from(self.glimpse_layout_count()))
            .map(|index| index as u8)
            .collect()
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
                // Both on top (either order).
                push_unique(&mut orders, vec![c0, c1]);
                push_unique(&mut orders, vec![c1, c0]);
                // One on top, one on bottom.
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
                // Both on bottom: relative order is fixed (as glimpsed). The
                // swapped bottom order is not a separate legal choice.
                push_unique(&mut orders, {
                    let mut tail = middle;
                    tail.push(c0);
                    tail.push(c1);
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
    SkipPreRecollect,
    MaterializeHammer,
    MaterializeDagger,
    MaterializeZanderMemory {
        /// `Some(layout)` when oracle / Monte Carlo may reorder the deck tail via Glimpse 2.
        glimpse_layout: Option<u8>,
    },
    /// Tristan levels from memory without Glimpse (unlike Zander).
    /// `agility` is the On Enter choice: skip the prep counter and gain agility 3.
    MaterializeTristanMemory {
        agility: bool,
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
    /// Full rules: attack a single non-Arthur ally by index (Spirit damage in solo).
    AttackAlly(u8),
    /// SolverReduced bulk swing of every ready non-Arthur ally.
    AttackOthers,
    PlayAlly {
        card: Card,
        kindle: u8,
        /// Ally index sacrificed for Peppered Chef on enter.
        sacrifice_ally: Option<u8>,
        hot_cake_sacrifice: bool,
        /// Material-deck champion leveled via Flagrant Guide on enter
        /// (`MAT_ZANDER`, `MAT_ZANDER_2`, or `MAT_TRISTAN`).
        flagrant_level: Option<u16>,
        /// Assassin action/attack returned from the graveyard when leveling to Deft Executor (−1 prep).
        flagrant_gy_return: Option<Card>,
        /// Flagrant Guide → Tristan On Enter: skip prep and gain agility 3.
        tristan_agility: bool,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_threads: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub glimpse_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_hand_duration_secs: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_card_draw: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exhaustive_reservation: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts", ts(type = "string | null"))]
    pub eval_mode: Option<&'static str>,
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
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,
            max_card_draw: None,
            exhaustive_reservation: None,
            eval_mode: None,
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
    /// Cap concurrent opening-hand solves in deck eval. None → no job-local cap.
    #[serde(default)]
    pub max_threads: Option<u16>,
    /// Override Glimpse during oracle / Monte Carlo search. Fire brick ignores this.
    #[serde(default)]
    pub glimpse_enabled: Option<bool>,
    /// Per-hand wall-clock limit. None / 0 → no limit.
    #[serde(default)]
    pub max_hand_duration_secs: Option<u16>,
    /// Cap known library draws; further draws become Fire Bricks. None / 0 → unlimited.
    #[serde(default)]
    pub max_card_draw: Option<u16>,
    /// Oracle / two-pass: branch on materially different reserve payments.
    #[serde(default)]
    pub exhaustive_reservation: Option<bool>,
}

/// Whether Glimpse is active for a solve pass.
pub fn effective_glimpse(
    sim_type: SimType,
    brick_pass: bool,
    glimpse_enabled: Option<bool>,
) -> bool {
    if sim_type == SimType::FireBrick || brick_pass {
        return false;
    }
    glimpse_enabled.unwrap_or(true)
}

/// Exhaustive reserve search applies only to oracle-style exact passes.
pub fn effective_exhaustive_reservation(
    sim_type: SimType,
    exhaustive_reservation: Option<bool>,
) -> bool {
    if !matches!(sim_type, SimType::OracleOnly | SimType::TwoPass) {
        return false;
    }
    exhaustive_reservation.unwrap_or(false)
}

pub fn hand_duration(max_hand_duration_secs: Option<u16>) -> Option<std::time::Duration> {
    max_hand_duration_secs
        .filter(|&secs| secs > 0)
        .map(|secs| std::time::Duration::from_secs(u64::from(secs)))
}

/// Truncate a known draw queue so later draws fall back to Fire Brick.
pub fn truncate_draw_queue(queue: Vec<Card>, max_card_draw: Option<u16>) -> Vec<Card> {
    match max_card_draw.filter(|&n| n > 0) {
        Some(n) => {
            let n = usize::from(n).min(DRAW_QUEUE_CAP);
            if queue.len() > n {
                queue[..n].to_vec()
            } else {
                queue
            }
        }
        None => queue,
    }
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
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

#[cfg(test)]
mod tests {
    use super::EffectiveRequest;
    use crate::budget::Budget;
    use crate::version::ENGINE_VERSION;

    #[test]
    fn effective_request_default_uses_conservative_budget() {
        let effective = EffectiveRequest::default();
        assert_eq!(effective.engine_version, ENGINE_VERSION);
        assert_eq!(effective.budget, Budget::conservative());
        assert!(effective.deck.is_empty());
        assert!(effective.max_turns.is_none());
    }
}
