//! Structured combat-tape events. English is formatted at the edge, not stored.

use crate::cards::{ALL_CARDS, Card};
use crate::model::{Action, State, Weapon};
use serde::Serialize;

#[cfg(feature = "ts")]
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum ActionOp {
    Start,
    Pass,
    SkipMaterialize,
    MaterializeHammer,
    MaterializeDagger,
    MaterializeZanderMemory,
    MaterializeTristanMemory,
    TristanRecollect,
    SkipAgility,
    MaterializeSoulknife,
    MaterializeRipper,
    MaterializeRing,
    ActivateDagger,
    ActivateRipper,
    ActivateSadi,
    ActivateArsonist,
    AttackArthur,
    AttackOthers,
    PlayAlly,
    PlayItem,
    PlayAttack,
    PlayAction,
    BlazingThrow,
    MercenaryBlade,
    BanishCrusaderRing,
    AttackWithWeapon,
}

impl ActionOp {
    pub fn from_action(action: Action) -> Self {
        match action {
            Action::Pass => Self::Pass,
            Action::SkipMaterialize => Self::SkipMaterialize,
            Action::MaterializeHammer => Self::MaterializeHammer,
            Action::MaterializeDagger => Self::MaterializeDagger,
            Action::MaterializeZanderMemory { .. } => Self::MaterializeZanderMemory,
            Action::MaterializeTristanMemory { .. } => Self::MaterializeTristanMemory,
            Action::TristanRecollect => Self::TristanRecollect,
            Action::SkipAgility => Self::SkipAgility,
            Action::MaterializeSoulknife => Self::MaterializeSoulknife,
            Action::MaterializeRipper => Self::MaterializeRipper,
            Action::MaterializeRing => Self::MaterializeRing,
            Action::ActivateDagger => Self::ActivateDagger,
            Action::ActivateRipper => Self::ActivateRipper,
            Action::ActivateSadi(_) => Self::ActivateSadi,
            Action::ActivateArsonist(_) => Self::ActivateArsonist,
            Action::AttackArthur(_) => Self::AttackArthur,
            Action::AttackOthers => Self::AttackOthers,
            Action::PlayAlly { .. } => Self::PlayAlly,
            Action::PlayItem { .. } => Self::PlayItem,
            Action::PlayAttack { .. } => Self::PlayAttack,
            Action::PlayAction { .. } => Self::PlayAction,
            Action::BlazingThrow(_) => Self::BlazingThrow,
            Action::MercenaryBlade => Self::MercenaryBlade,
            Action::BanishCrusaderRing => Self::BanishCrusaderRing,
            Action::AttackWithWeapon(_) => Self::AttackWithWeapon,
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::Pass => "pass",
            Self::SkipMaterialize => "skipMaterialize",
            Self::MaterializeHammer => "materializeHammer",
            Self::MaterializeDagger => "materializeDagger",
            Self::MaterializeZanderMemory => "materializeZanderMemory",
            Self::MaterializeTristanMemory => "materializeTristanMemory",
            Self::TristanRecollect => "tristanRecollect",
            Self::SkipAgility => "skipAgility",
            Self::MaterializeSoulknife => "materializeSoulknife",
            Self::MaterializeRipper => "materializeRipper",
            Self::MaterializeRing => "materializeRing",
            Self::ActivateDagger => "activateDagger",
            Self::ActivateRipper => "activateRipper",
            Self::ActivateSadi => "activateSadi",
            Self::ActivateArsonist => "activateArsonist",
            Self::AttackArthur => "attackArthur",
            Self::AttackOthers => "attackOthers",
            Self::PlayAlly => "playAlly",
            Self::PlayItem => "playItem",
            Self::PlayAttack => "playAttack",
            Self::PlayAction => "playAction",
            Self::BlazingThrow => "blazingThrow",
            Self::MercenaryBlade => "mercenaryBlade",
            Self::BanishCrusaderRing => "banishCrusaderRing",
            Self::AttackWithWeapon => "attackWithWeapon",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum EventKind {
    Start,
    MaterializeHammer,
    MaterializeDagger,
    MaterializeSoulknife,
    MaterializeRipper,
    MaterializeRing,
    FloatForRipper,
    MaterializeBlade,
    FloatForZander,
    FloatForZander2,
    LevelZander,
    LevelZander2,
    ZanderGyReturn,
    FloatForTristan,
    LevelTristan,
    TristanRecollect,
    Glimpse,
    MaterializeResolves,
    Play,
    ActivateDagger,
    ActivateRipper,
    SadiBounce,
    ArsonistStealth,
    OnDeath,
    UniqueDies,
    Sacrifice,
    OnEnterDamage,
    OnEnterDraw,
    OnEnterLevel,
    Immortalize,
    HotCakeSacrifice,
    ChefBuff,
    AllyAttack,
    WeaponAttack,
    WieldForAttack,
    CutthroatSelf,
    OnAttackDraw,
    CorhaziOnHit,
    HammerSelf,
    BanishCrusaderRing,
    PassOpportunity,
    EndAgility,
    EndMain,
    EnemyMain,
    Wake,
    Recollect,
}

impl EventKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::MaterializeHammer => "materializeHammer",
            Self::MaterializeDagger => "materializeDagger",
            Self::MaterializeSoulknife => "materializeSoulknife",
            Self::MaterializeRipper => "materializeRipper",
            Self::MaterializeRing => "materializeRing",
            Self::FloatForRipper => "floatForRipper",
            Self::MaterializeBlade => "materializeBlade",
            Self::FloatForZander => "floatForZander",
            Self::FloatForZander2 => "floatForZander2",
            Self::LevelZander => "levelZander",
            Self::LevelZander2 => "levelZander2",
            Self::ZanderGyReturn => "zanderGyReturn",
            Self::FloatForTristan => "floatForTristan",
            Self::LevelTristan => "levelTristan",
            Self::TristanRecollect => "tristanRecollect",
            Self::Glimpse => "glimpse",
            Self::MaterializeResolves => "materializeResolves",
            Self::Play => "play",
            Self::ActivateDagger => "activateDagger",
            Self::ActivateRipper => "activateRipper",
            Self::SadiBounce => "sadiBounce",
            Self::ArsonistStealth => "arsonistStealth",
            Self::OnDeath => "onDeath",
            Self::UniqueDies => "uniqueDies",
            Self::Sacrifice => "sacrifice",
            Self::OnEnterDamage => "onEnterDamage",
            Self::OnEnterDraw => "onEnterDraw",
            Self::OnEnterLevel => "onEnterLevel",
            Self::Immortalize => "immortalize",
            Self::HotCakeSacrifice => "hotCakeSacrifice",
            Self::ChefBuff => "chefBuff",
            Self::AllyAttack => "allyAttack",
            Self::WeaponAttack => "weaponAttack",
            Self::WieldForAttack => "wieldForAttack",
            Self::CutthroatSelf => "cutthroatSelf",
            Self::OnAttackDraw => "onAttackDraw",
            Self::CorhaziOnHit => "corhaziOnHit",
            Self::HammerSelf => "hammerSelf",
            Self::BanishCrusaderRing => "banishCrusaderRing",
            Self::PassOpportunity => "passOpportunity",
            Self::EndAgility => "endAgility",
            Self::EndMain => "endMain",
            Self::EnemyMain => "enemyMain",
            Self::Wake => "wake",
            Self::Recollect => "recollect",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum TapePhase {
    Main,
    Materialize,
    Recollect,
    Agility,
    End,
    EnemyMain,
    EnemyEnd,
    Wake,
}

impl TapePhase {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Main => "main",
            Self::Materialize => "materialize",
            Self::Recollect => "recollect",
            Self::Agility => "agility",
            Self::End => "end",
            Self::EnemyMain => "enemyMain",
            Self::EnemyEnd => "enemyEnd",
            Self::Wake => "wake",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct AttackBonuses {
    #[serde(skip_serializing_if = "is_zero_u8")]
    pub arthur: u8,
    #[serde(skip_serializing_if = "is_zero_u8")]
    pub hot_cake: u8,
    #[serde(skip_serializing_if = "is_zero_u8")]
    pub unique: u8,
    #[serde(skip_serializing_if = "is_zero_u8")]
    pub ally_attack: u8,
}

fn is_zero_u8(value: &u8) -> bool {
    *value == 0
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct LineEvent {
    pub op: ActionOp,
    pub kind: EventKind,
    pub action_index: u16,
    pub turn: u8,
    pub phase: TapePhase,
    pub damage: u8,
    pub fire_gy: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kindle: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drawn: Option<&'static str>,
    /// Card drawn directly into the memory zone (Increasing Danger).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_draw: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discarded: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prepared: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imbue: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_ally: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bonuses: Option<AttackBonuses>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hand: Option<Vec<&'static str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory: Option<Vec<&'static str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allies: Option<Vec<&'static str>>,
    /// Fast ally play during materialize (formatter hint).
    #[serde(default, skip_serializing_if = "is_false")]
    pub fast: bool,
    /// Rending Flames doubled, etc.
    #[serde(default, skip_serializing_if = "is_false")]
    pub doubled: bool,
    /// Zander memory cost paid from the memory zone (vs floating memory in GY).
    #[serde(default, skip_serializing_if = "is_false")]
    pub from_memory: bool,
    /// GY-threshold / human-class style flags for formatter.
    #[serde(default, skip_serializing_if = "is_false")]
    pub heated: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub human: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub gy_threshold: bool,
}

impl Weapon {
    pub const fn id(self) -> Option<&'static str> {
        match self {
            Self::None => None,
            Self::ImpactHammer => Some("impact_hammer"),
            Self::MercenaryBlade => Some("mercenary_blade"),
            Self::VaruckanSoulknife => Some("varuckan_soulknife"),
            Self::AssassinsRipper => Some("assassins_ripper"),
        }
    }
}

pub fn zone_ids(counts: &[u8; crate::cards::CARD_COUNT]) -> Vec<&'static str> {
    ALL_CARDS
        .iter()
        .flat_map(|&card| std::iter::repeat_n(card.id(), counts[card.index()] as usize))
        .collect()
}

pub fn ally_ids(state: State) -> Vec<&'static str> {
    state.allies[..state.ally_len as usize]
        .iter()
        .map(|ally| ally.card().id())
        .collect()
}

#[derive(Clone, Debug)]
pub struct TapeCheckpoint {
    pub events_len: usize,
    action_index: u16,
    op: ActionOp,
    last_hand: Vec<&'static str>,
    last_memory: Vec<&'static str>,
    last_allies: Vec<&'static str>,
    has_snapshot: bool,
}

#[derive(Clone, Debug)]
pub struct EventTape {
    pub events: Vec<LineEvent>,
    action_index: u16,
    op: ActionOp,
    last_hand: Vec<&'static str>,
    last_memory: Vec<&'static str>,
    last_allies: Vec<&'static str>,
    has_snapshot: bool,
    /// When false, skip zone snapshots and event storage (search expansion path).
    recording: bool,
}

impl EventTape {
    pub fn new() -> Self {
        Self {
            events: Vec::with_capacity(64),
            action_index: 0,
            op: ActionOp::Start,
            last_hand: Vec::new(),
            last_memory: Vec::new(),
            last_allies: Vec::new(),
            has_snapshot: false,
            recording: true,
        }
    }

    /// Reused for search expansion so millions of apply calls do not allocate tapes.
    pub fn silent() -> Self {
        Self {
            events: Vec::new(),
            action_index: 0,
            op: ActionOp::Start,
            last_hand: Vec::new(),
            last_memory: Vec::new(),
            last_allies: Vec::new(),
            has_snapshot: false,
            recording: false,
        }
    }

    pub fn checkpoint(&self) -> TapeCheckpoint {
        TapeCheckpoint {
            events_len: self.events.len(),
            action_index: self.action_index,
            op: self.op,
            last_hand: self.last_hand.clone(),
            last_memory: self.last_memory.clone(),
            last_allies: self.last_allies.clone(),
            has_snapshot: self.has_snapshot,
        }
    }

    pub fn restore(&mut self, cp: TapeCheckpoint) {
        self.events.truncate(cp.events_len);
        self.action_index = cp.action_index;
        self.op = cp.op;
        self.last_hand = cp.last_hand;
        self.last_memory = cp.last_memory;
        self.last_allies = cp.last_allies;
        self.has_snapshot = cp.has_snapshot;
    }

    pub fn begin_action(&mut self, op: ActionOp) {
        if !self.recording {
            return;
        }
        self.op = op;
        self.action_index = self.action_index.saturating_add(1);
    }

    pub fn push(&mut self, state: State, phase: TapePhase, kind: EventKind, fields: EventFields) {
        if !self.recording {
            return;
        }
        let hand = zone_ids(&state.hand);
        let memory = zone_ids(&state.memory);
        let allies = ally_ids(state);
        let zones_changed = !self.has_snapshot
            || hand != self.last_hand
            || memory != self.last_memory
            || allies != self.last_allies;

        let event = LineEvent {
            op: self.op,
            kind,
            action_index: self.action_index,
            turn: state.turn,
            phase,
            damage: state.damage,
            fire_gy: state.fire_gy,
            card: fields.card.map(Card::id),
            kindle: fields.kindle.filter(|&k| k > 0),
            drawn: fields.drawn.map(Card::id),
            memory_draw: fields.memory_draw.map(Card::id),
            discarded: fields.discarded.map(Card::id),
            prepared: fields.prepared,
            imbue: fields.imbue,
            weapon: fields.weapon.and_then(Weapon::id),
            command_ally: fields.command_ally.map(Card::id),
            bonuses: fields
                .bonuses
                .filter(|b| b.arthur > 0 || b.hot_cake > 0 || b.unique > 0 || b.ally_attack > 0),
            hand: if zones_changed {
                Some(hand.clone())
            } else {
                None
            },
            memory: if zones_changed {
                Some(memory.clone())
            } else {
                None
            },
            allies: if zones_changed {
                Some(allies.clone())
            } else {
                None
            },
            fast: fields.fast,
            doubled: fields.doubled,
            from_memory: fields.from_memory,
            heated: fields.heated,
            human: fields.human,
            gy_threshold: fields.gy_threshold,
        };
        self.events.push(event);
        if zones_changed {
            self.last_hand = hand;
            self.last_memory = memory;
            self.last_allies = allies;
            self.has_snapshot = true;
        }
    }

    pub fn push_start(&mut self, state: State, opening_draw: Option<Card>) {
        self.op = ActionOp::Start;
        self.action_index = 0;
        let fields = match opening_draw {
            Some(drawn) => EventFields::default().with_drawn(drawn),
            None => EventFields::default(),
        };
        self.push(state, TapePhase::Main, EventKind::Start, fields);
    }
}

/// Record On Death effects after an ally is sent to the graveyard.
pub fn push_ally_gy_death(state: &mut State, card: Card, phase: TapePhase, tape: &mut EventTape) {
    if card.on_death_damage() > 0 {
        tape.push(*state, phase, EventKind::OnDeath, EventFields::card(card));
    } else if card.on_death_draw() {
        let drawn = state.draw_unknown();
        tape.push(
            *state,
            phase,
            EventKind::OnDeath,
            EventFields::card(card).with_drawn(drawn),
        );
    }
}

impl Default for EventTape {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct EventFields {
    pub card: Option<Card>,
    pub kindle: Option<u8>,
    pub drawn: Option<Card>,
    pub memory_draw: Option<Card>,
    pub discarded: Option<Card>,
    pub prepared: Option<bool>,
    pub imbue: Option<bool>,
    pub weapon: Option<Weapon>,
    pub command_ally: Option<Card>,
    pub bonuses: Option<AttackBonuses>,
    pub fast: bool,
    pub doubled: bool,
    pub from_memory: bool,
    pub heated: bool,
    pub human: bool,
    pub gy_threshold: bool,
}

impl EventFields {
    pub fn card(card: Card) -> Self {
        Self {
            card: Some(card),
            ..Self::default()
        }
    }

    pub fn with_kindle(mut self, kindle: u8) -> Self {
        self.kindle = Some(kindle);
        self
    }

    pub fn with_drawn(mut self, drawn: Card) -> Self {
        self.drawn = Some(drawn);
        self
    }

    pub fn with_memory_draw(mut self, memory_draw: Card) -> Self {
        self.memory_draw = Some(memory_draw);
        self
    }

    pub fn with_discarded(mut self, discarded: Card) -> Self {
        self.discarded = Some(discarded);
        self
    }

    pub fn with_prepared(mut self, prepared: bool) -> Self {
        self.prepared = Some(prepared);
        self
    }

    pub fn with_imbue(mut self, imbue: bool) -> Self {
        self.imbue = Some(imbue);
        self
    }

    pub fn with_weapon(mut self, weapon: Weapon) -> Self {
        self.weapon = Some(weapon);
        self
    }

    pub fn with_command_ally(mut self, card: Card) -> Self {
        self.command_ally = Some(card);
        self
    }

    pub fn with_bonuses(mut self, bonuses: AttackBonuses) -> Self {
        self.bonuses = Some(bonuses);
        self
    }

    pub fn fast(mut self) -> Self {
        self.fast = true;
        self
    }

    pub fn doubled(mut self) -> Self {
        self.doubled = true;
        self
    }

    pub fn from_memory(mut self) -> Self {
        self.from_memory = true;
        self
    }

    pub fn heated(mut self) -> Self {
        self.heated = true;
        self
    }

    pub fn human(mut self) -> Self {
        self.human = true;
        self
    }

    pub fn gy_threshold(mut self) -> Self {
        self.gy_threshold = true;
        self
    }
}

/// Format a line event using engine card names (CLI / debug).
pub fn format_line_event(event: &LineEvent) -> String {
    let name = |id: Option<&str>| -> String {
        id.and_then(|id| {
            ALL_CARDS
                .into_iter()
                .find(|c| c.id() == id)
                .map(|c| c.name().to_string())
        })
        .unwrap_or_else(|| id.unwrap_or("").to_string())
    };
    let short = |id: Option<&str>| -> String {
        id.and_then(|id| {
            ALL_CARDS
                .into_iter()
                .find(|c| c.id() == id)
                .map(|c| c.short().to_string())
        })
        .unwrap_or_else(|| id.unwrap_or("").to_string())
    };
    let weapon_name = |id: Option<&str>| -> &'static str {
        match id {
            Some("impact_hammer") => "Impact Hammer",
            Some("mercenary_blade") => "Mercenary's Blade",
            Some("varuckan_soulknife") => "Varuckan Soulknife",
            Some("assassins_ripper") => "Assassin's Ripper",
            _ => "No Weapon",
        }
    };

    let label = match event.kind {
        EventKind::Start => {
            if let Some(drawn) = event.drawn {
                format!("Start of Game (draw {})", short(Some(drawn)))
            } else {
                "Start of Game".to_string()
            }
        }
        EventKind::MaterializeHammer => "Materialize Impact Hammer".to_string(),
        EventKind::MaterializeDagger => "Materialize Poisoned Dagger".to_string(),
        EventKind::MaterializeSoulknife => {
            "Materialize Varuckan Soulknife (banish 3 Fire)".to_string()
        }
        EventKind::FloatForRipper => {
            if event.from_memory {
                "Mem Cost for Assassin's Ripper (from Mem)".to_string()
            } else {
                "Mem Cost for Assassin's Ripper (Float from GY)".to_string()
            }
        }
        EventKind::MaterializeRipper => "Materialize Assassin's Ripper".to_string(),
        EventKind::MaterializeRing => "Materialize Grand Crusader's Ring".to_string(),
        EventKind::MaterializeBlade => "Materialize Mercenary's Blade (prep)".to_string(),
        EventKind::FloatForZander => {
            if event.from_memory {
                "Mem Cost for Zander Lvl 1 (from Mem)".to_string()
            } else {
                "Mem Cost for Zander Lvl 1 (Float from GY)".to_string()
            }
        }
        EventKind::LevelZander => "Zander Lvl 1 Glimpse/Prep".to_string(),
        EventKind::FloatForZander2 => {
            if event.from_memory {
                "Mem Cost for Zander Lvl 2 (from Mem ×2)".to_string()
            } else {
                "Mem Cost for Zander Lvl 2".to_string()
            }
        }
        EventKind::LevelZander2 => "Zander, Deft Executor (+2 prep)".to_string(),
        EventKind::ZanderGyReturn => {
            format!("Zander return {} from GY (−1 prep)", short(event.drawn))
        }
        EventKind::FloatForTristan => {
            if event.from_memory {
                "Mem Cost for Tristan Lvl 1 (from Mem)".to_string()
            } else {
                "Mem Cost for Tristan Lvl 1 (Float from GY)".to_string()
            }
        }
        EventKind::LevelTristan => "Tristan Lvl 1 Glimpse/Prep".to_string(),
        EventKind::TristanRecollect => {
            let mut parts = Vec::new();
            if let Some(id) = event.card {
                parts.push(short(Some(id)));
            }
            if let Some(id) = event.drawn {
                parts.push(short(Some(id)));
            }
            if let Some(id) = event.discarded {
                parts.push(short(Some(id)));
            }
            if parts.is_empty() {
                "Tristan Recollect (Agility 3)".to_string()
            } else {
                format!("Tristan Recollect (Agility 3): {}", parts.join(", "))
            }
        }
        EventKind::Glimpse => {
            let n = usize::from(event.card.is_some()) + usize::from(event.drawn.is_some());
            let mut parts = Vec::new();
            if let Some(id) = event.card {
                parts.push(short(Some(id)));
            }
            if let Some(id) = event.drawn {
                parts.push(short(Some(id)));
            }
            if n == 0 {
                "Glimpse".to_string()
            } else {
                format!("Glimpse {} ({})", n, parts.join(", "))
            }
        }
        EventKind::MaterializeResolves => "Materialization Resolves".to_string(),
        EventKind::Play => {
            let card_name = name(event.card);
            let mut s = if event.fast {
                format!("Fast Activate {card_name}")
            } else if matches!(
                event.card,
                Some(
                    "fiery_interference"
                        | "mark_the_target"
                        | "planted_explosive"
                        | "intensified_pyre"
                        | "vermilion_decree"
                        | "demolition"
                        | "surging_bolt"
                        | "ignited_stab"
                        | "rending_flames"
                        | "heated_vengeance"
                        | "vicious_slice"
                        | "uncanny_realization"
                        | "incapacitate"
                        | "undeniable_truth"
                        | "ignite_fate"
                        | "increasing_danger"
                        | "reduce_to_ash"
                        | "smoke_out"
                        | "spark_alight"
                )
            ) {
                card_name
            } else {
                format!("Activate {card_name}")
            };
            if event.card == Some("increasing_danger") {
                s = match (event.drawn, event.memory_draw) {
                    (Some(drawn), Some(mem)) => format!(
                        "Increasing Danger (draw {}, memory {})",
                        short(Some(drawn)),
                        short(Some(mem))
                    ),
                    _ => "Increasing Danger".to_string(),
                };
            }
            if event.card == Some("undeniable_truth")
                && let Some(drawn) = event.drawn
            {
                s = format!("Undeniable Truth (draw {}, +1 prep)", short(Some(drawn)));
            }
            if event.prepared == Some(true) {
                if event.card == Some("ignited_stab") {
                    s = "Ignited Stab (prepared)".to_string();
                } else if event.card == Some("planted_explosive") {
                    s = "Planted Explosive (prepared)".to_string();
                } else {
                    s.push_str(" (prepared)");
                }
            } else if event.prepared == Some(false) && event.card == Some("ignited_stab") {
                s = "Ignited Stab (no prep)".to_string();
            }
            if event.doubled {
                s = "Rending Flames (Doubled)".to_string();
            }
            if event.heated {
                s = "Heated Vengeance (+3)".to_string();
            }
            if event.human {
                s = "Vicious Slice (Human)".to_string();
            }
            if event.gy_threshold {
                s = "Intensified Pyre (GY 8+)".to_string();
            }
            if event.imbue == Some(true) {
                if let Some(drawn) = event.drawn {
                    s = format!("Vermilion Decree (Imbue, draw {})", short(Some(drawn)));
                } else if event.card == Some("surging_bolt") {
                    s = "Surging Bolt (Imbue)".to_string();
                } else {
                    s.push_str(" (Imbue)");
                }
            }
            if let Some(ally) = event.command_ally {
                s = format!("{s} (Command {})", name(Some(ally)));
            }
            if let Some(w) = event.weapon {
                if event.card == Some("blazing_throw") {
                    s = format!("Activate Blazing Throw ({})", weapon_name(Some(w)));
                } else {
                    s = format!("{s} with {}", weapon_name(Some(w)));
                }
            }
            if let Some(kindle) = event.kindle
                && kindle > 0
            {
                s = format!("{s} (Kindle {kindle})");
            }
            if let Some(bonuses) = &event.bonuses {
                let mut parts = Vec::new();
                if bonuses.ally_attack > 0 {
                    parts.push(format!("attack +{}", bonuses.ally_attack));
                }
                if bonuses.unique > 0 {
                    parts.push(format!("unique +{}", bonuses.unique));
                }
                if bonuses.arthur > 0 {
                    parts.push(format!("Arthur +{}", bonuses.arthur));
                }
                if bonuses.hot_cake > 0 {
                    parts.push(format!("Hot Cake +{}", bonuses.hot_cake));
                }
                if !parts.is_empty() {
                    s = format!("{s} ({})", parts.join(", "));
                }
            }
            s
        }
        EventKind::ActivateDagger => "Activate Poisoned Dagger".to_string(),
        EventKind::ActivateRipper => "Activate Assassin's Ripper (+2 power, REST)".to_string(),
        EventKind::BanishCrusaderRing => {
            if let Some(drawn) = event.drawn {
                format!("Banish Grand Crusader's Ring (draw {})", short(Some(drawn)))
            } else {
                "Banish Grand Crusader's Ring (draw)".to_string()
            }
        }
        EventKind::SadiBounce => "Sadi bounce for Prep".to_string(),
        EventKind::ArsonistStealth => {
            "Corhazi Arsonist gains stealth (−1 prep)".to_string()
        }
        EventKind::OnDeath => {
            if event.drawn.is_some() {
                format!(
                    "{} On Death draw ({})",
                    name(event.card),
                    short(event.drawn)
                )
            } else {
                format!("{} On Death", name(event.card))
            }
        }
        EventKind::UniqueDies => format!("Unique: {} dies", name(event.card)),
        EventKind::Sacrifice => match event.card {
            Some(card) => format!("Sacrifice {}", name(Some(card))),
            None => "Peppered Chef sacrifice".to_string(),
        },
        EventKind::OnEnterDamage => {
            if event.card == Some("rococo") {
                "Rococo On-Enter damage".to_string()
            } else {
                format!("{} On-Enter damage", name(event.card))
            }
        }
        EventKind::OnEnterDraw => {
            format!("Clumsy On-Enter draw ({})", short(event.drawn))
        }
        EventKind::OnEnterLevel => {
            let self_dmg = event.kindle.unwrap_or(6);
            format!("Flagrant Guide On-Enter level (self {self_dmg})",)
        }
        EventKind::Immortalize => "Immortalize the King".to_string(),
        EventKind::HotCakeSacrifice => "Hot Cake sacrifice (+3 next attack)".to_string(),
        EventKind::ChefBuff => "Peppered Chef +2 POWER".to_string(),
        EventKind::AllyAttack => {
            let mut s = format!("Attack from {}", name(event.card));
            if let Some(bonuses) = &event.bonuses {
                let mut parts = Vec::new();
                if bonuses.arthur > 0 {
                    parts.push(format!("Arthur +{}", bonuses.arthur));
                }
                if bonuses.hot_cake > 0 {
                    parts.push(format!("Hot Cake +{}", bonuses.hot_cake));
                }
                if !parts.is_empty() {
                    s = format!("{s} ({})", parts.join(", "));
                }
            }
            s
        }
        EventKind::WeaponAttack => {
            format!("Attack with {}", weapon_name(event.weapon))
        }
        EventKind::WieldForAttack => {
            format!("USE IN BELOW ATTACK ({})", weapon_name(event.weapon))
        }
        EventKind::CutthroatSelf => "Cutthroat On-Attack self 1".to_string(),
        EventKind::OnAttackDraw => format!(
            "On-Attack discard {} / draw {}",
            short(event.discarded),
            short(event.drawn)
        ),
        EventKind::CorhaziOnHit => {
            let s = format!(
                "Corhazi On-Hit draw {} / discard {}",
                short(event.drawn),
                short(event.discarded)
            );
            // Fire ping is inferred when damage rose; formatter keeps base label.
            s
        }
        EventKind::HammerSelf => "Impact Hammer self 3".to_string(),
        EventKind::PassOpportunity => "Main: Pass Opportunity".to_string(),
        EventKind::EndAgility => "End of Agility Phase".to_string(),
        EventKind::EndMain => "End of End Phase".to_string(),
        EventKind::EnemyMain => "Enemy Main Phase".to_string(),
        EventKind::Wake => {
            // Distinguishes wake-up vs end-of-enemy-end by phase.
            if event.phase == TapePhase::Wake {
                "End of Enemy End Phase".to_string()
            } else {
                "Wake Up Phase".to_string()
            }
        }
        EventKind::Recollect => format!("Recollect (draw {})", short(event.drawn)),
    };

    // Corhazi fire ping: if discarded was fire and damage advanced, append.
    // We don't store a flag; leave base label. Stats walk drawn/discarded/damage.

    label
}

/// Compact one-line tape display (CLI).
pub fn format_line_event_row(event: &LineEvent) -> String {
    let phase = match event.phase {
        TapePhase::Main => "Main",
        TapePhase::Materialize => "Mate",
        TapePhase::Recollect => "Reco",
        TapePhase::Agility => "Agil",
        TapePhase::End => "End",
        TapePhase::EnemyMain => "EMai",
        TapePhase::EnemyEnd => "EEnd",
        TapePhase::Wake => "Wake",
    };
    let action = format_line_event(event);
    let allies = event.allies.as_ref().map(|a| a.len()).unwrap_or(0);
    let memory = event
        .memory
        .as_ref()
        .map(|ids| {
            if ids.is_empty() {
                "MEM0".to_string()
            } else {
                let shorts: Vec<_> = ids
                    .iter()
                    .map(|id| {
                        ALL_CARDS
                            .into_iter()
                            .find(|c| c.id() == *id)
                            .map(|c| c.short())
                            .unwrap_or(*id)
                    })
                    .collect();
                format!("MEM{} {}", ids.len(), shorts.join(", "))
            }
        })
        .unwrap_or_default();
    let hand = event
        .hand
        .as_ref()
        .map(|ids| {
            if ids.is_empty() {
                "HAND0".to_string()
            } else {
                let shorts: Vec<_> = ids
                    .iter()
                    .map(|id| {
                        ALL_CARDS
                            .into_iter()
                            .find(|c| c.id() == *id)
                            .map(|c| c.short())
                            .unwrap_or(*id)
                    })
                    .collect();
                format!("HAND{} {}", ids.len(), shorts.join(", "))
            }
        })
        .unwrap_or_default();
    format!(
        "{} {:<4} | {:>3} | allies={} | FireGY {} | {:<42} | {:<34} | {}",
        event.turn, phase, event.damage, allies, event.fire_gy, action, memory, hand
    )
}
