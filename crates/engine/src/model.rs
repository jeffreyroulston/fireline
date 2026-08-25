use crate::cards::{ALL_CARDS, CARD_COUNT, Card};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const MAT_HAMMER: u8 = 1 << 0;
pub const MAT_BLADE: u8 = 1 << 1;
pub const MAT_DAGGER: u8 = 1 << 2;
pub const MAT_ZANDER: u8 = 1 << 3;
pub const MAT_SOULKNIFE: u8 = 1 << 4;
pub const ALL_MATERIALS: u8 = MAT_HAMMER | MAT_BLADE | MAT_DAGGER | MAT_ZANDER | MAT_SOULKNIFE;
pub const DRAW_QUEUE_CAP: usize = 64;

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub struct Ally {
    pub card: u8,
    pub awake: bool,
    pub immortal: bool,
    /// Bonus power consumed on the ally's next attack this turn.
    pub attack_buff: u8,
}

impl Ally {
    #[inline]
    pub fn card(self) -> Card {
        ALL_CARDS[self.card as usize]
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

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
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
    /// Fixed upcoming draws for Monte Carlo / oracle passes. Empty ⇒ fire bricks.
    pub queue: [u8; DRAW_QUEUE_CAP],
    pub queue_len: u8,
    pub queue_pos: u8,
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
            queue: draw_queue,
            queue_len,
            queue_pos: 0,
        }
    }

    #[inline]
    pub const fn is_terminal(self) -> bool {
        self.turn >= self.max_turns
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

    pub fn pay_reserve(&mut self, cost: u8) -> bool {
        if self.hand_len < cost {
            return false;
        }
        let snapshot = *self;
        let mut selected = [0_u8; CARD_COUNT];
        for _ in 0..cost {
            let Some(card) = snapshot.best_payment_with_selected(&selected) else {
                return false;
            };
            selected[card.index()] += 1;
        }
        for card in ALL_CARDS {
            let count = selected[card.index()];
            if count == 0 {
                continue;
            }
            self.hand[card.index()] -= count;
            self.memory[card.index()] += count;
            self.hand_len -= count;
            self.memory_len += count;
        }
        true
    }

    pub fn pay_with_kindle(&mut self, cost: u8, kindle: u8) -> bool {
        let kindle = kindle.min(cost).min(self.fire_gy);
        let reserve = cost.saturating_sub(kindle);
        if !self.pay_reserve(reserve) {
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

    fn best_payment_with_selected(self, selected: &[u8; CARD_COUNT]) -> Option<Card> {
        ALL_CARDS
            .iter()
            .copied()
            .filter(|card| self.hand[card.index()] > selected[card.index()])
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
        self.allies[index] = Ally {
            card: card as u8,
            awake,
            immortal,
            attack_buff: 0,
        };
        self.ally_len += 1;
    }

    pub fn remove_ally(&mut self, index: usize, to_gy: bool) {
        if index >= self.ally_len as usize {
            return;
        }
        let removed = self.allies[index];
        if to_gy {
            self.send_to_gy(removed.card());
        }
        let len = self.ally_len as usize;
        self.allies.copy_within(index + 1..len, index);
        self.allies[len - 1] = Ally::default();
        self.ally_len -= 1;
    }

    pub fn arthur_rested(self) -> bool {
        self.allies[..self.ally_len as usize]
            .iter()
            .any(|ally| ally.card() == Card::Arthur && !ally.awake)
    }

    pub fn has_arthur(self) -> bool {
        self.allies[..self.ally_len as usize]
            .iter()
            .any(|ally| ally.card() == Card::Arthur)
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
        ally.awake && !(self.go_first && self.turn == 0) && self.ally_power(ally) > 0
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
        let card = snapshot.best_payment_with_selected(&selected)?;
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
            ally.awake = true;
            ally.immortal = false;
            ally.attack_buff = 0;
        }
        if self.dagger {
            self.dagger_ready = true;
        }
        self.amplify = false;
        self.agility = 0;
    }

    pub fn enemy_cull(&mut self) {
        let mut index = 0;
        while index < self.ally_len as usize {
            let ally = self.allies[index];
            if ally.immortal || ally.card().is_stealth() {
                index += 1;
            } else {
                self.remove_ally(index, true);
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
    },
    PlayAction {
        card: Card,
        kindle: u8,
        prepared: bool,
    },
    BlazingThrow,
    MercenaryBlade,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SimType {
    #[default]
    FireBrick,
    MonteCarlo,
    TwoPass,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PassResult {
    pub max_damage: u8,
    pub steps: Vec<Step>,
    pub nodes: u64,
    pub memo_entries: usize,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McRollout {
    pub damage: u8,
    pub steps: Vec<Step>,
    pub nodes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
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
pub struct TwoPassResult {
    pub brick: PassResult,
    pub oracle: PassResult,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveResult {
    pub sim_type: SimType,
    pub max_damage: u8,
    pub steps: Vec<Step>,
    pub nodes: u64,
    pub memo_entries: usize,
    pub elapsed_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distribution: Option<DamageDistribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_pass: Option<TwoPassResult>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
    /// Raw line counters for the headline path (skipped in JSON).
    #[serde(skip)]
    pub line_stats: crate::stats::LineCardStats,
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
