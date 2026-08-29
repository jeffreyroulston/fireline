use serde::{Deserialize, Serialize};

#[cfg(feature = "ts")]
use ts_rs::TS;

pub const CARD_COUNT: usize = 47;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[repr(u8)]
pub enum Card {
    Brick = 0,
    Arthur = 1,
    KingdomInformant = 2,
    ClumsyApprentice = 3,
    SableRemnant = 4,
    HastyMessenger = 5,
    RedHare = 6,
    IgnitedStab = 7,
    RendingFlames = 8,
    BlazingThrow = 9,
    CorhaziCourier = 10,
    VeteranBlazebearer = 11,
    Sadi = 12,
    CaptivatingCutthroat = 13,
    DazzlingCourtesan = 14,
    FieryInterference = 15,
    HeatedVengeance = 16,
    IntensifiedPyre = 17,
    MarchHare = 18,
    MarkTheTarget = 19,
    PepperedChef = 20,
    PlantedExplosive = 21,
    Rococo = 22,
    Tweedledum = 23,
    VermilionDecree = 24,
    XiaoQiao = 25,
    HotCake = 26,
    UncannyRealization = 27,
    Virgil = 28,
    ViciousSlice = 29,
    ManicZealot = 30,
    Demolition = 31,
    SurgingBolt = 32,
    WoodlandSquirrels = 33,
    DuchessSixOfHearts = 34,
    WanderingGlaivier = 35,
    FlagrantGuide = 36,
    Gildas = 37,
    Incapacitate = 38,
    LurkingAssailant = 39,
    UndeniableTruth = 40,
    CorhaziArsonist = 41,
    IgniteFate = 42,
    IncreasingDanger = 43,
    ReduceToAsh = 44,
    SmokeOut = 45,
    SparkAlight = 46,
}

impl Card {
    #[inline]
    pub const fn index(self) -> usize {
        self as usize
    }

    pub const fn id(self) -> &'static str {
        match self {
            Self::Brick => "brick",
            Self::Arthur => "arthur",
            Self::KingdomInformant => "kingdom_informant",
            Self::ClumsyApprentice => "clumsy_apprentice",
            Self::SableRemnant => "sable_remnant",
            Self::HastyMessenger => "hasty_messenger",
            Self::RedHare => "red_hare",
            Self::IgnitedStab => "ignited_stab",
            Self::RendingFlames => "rending_flames",
            Self::BlazingThrow => "blazing_throw",
            Self::CorhaziCourier => "corhazi_courier",
            Self::VeteranBlazebearer => "veteran_blazebearer",
            Self::Sadi => "sadi",
            Self::CaptivatingCutthroat => "captivating_cutthroat",
            Self::DazzlingCourtesan => "dazzling_courtesan",
            Self::FieryInterference => "fiery_interference",
            Self::HeatedVengeance => "heated_vengeance",
            Self::IntensifiedPyre => "intensified_pyre",
            Self::MarchHare => "march_hare",
            Self::MarkTheTarget => "mark_the_target",
            Self::PepperedChef => "peppered_chef",
            Self::PlantedExplosive => "planted_explosive",
            Self::Rococo => "rococo",
            Self::Tweedledum => "tweedledum",
            Self::VermilionDecree => "vermilion_decree",
            Self::XiaoQiao => "xiao_qiao",
            Self::HotCake => "hot_cake",
            Self::UncannyRealization => "uncanny_realization",
            Self::Virgil => "virgil",
            Self::ViciousSlice => "vicious_slice",
            Self::ManicZealot => "manic_zealot",
            Self::Demolition => "demolition",
            Self::SurgingBolt => "surging_bolt",
            Self::WoodlandSquirrels => "woodland_squirrels",
            Self::DuchessSixOfHearts => "duchess_six_of_hearts",
            Self::WanderingGlaivier => "wandering_glaivier",
            Self::FlagrantGuide => "flagrant_guide",
            Self::Gildas => "gildas",
            Self::Incapacitate => "incapacitate",
            Self::LurkingAssailant => "lurking_assailant",
            Self::UndeniableTruth => "undeniable_truth",
            Self::CorhaziArsonist => "corhazi_arsonist",
            Self::IgniteFate => "ignite_fate",
            Self::IncreasingDanger => "increasing_danger",
            Self::ReduceToAsh => "reduce_to_ash",
            Self::SmokeOut => "smoke_out",
            Self::SparkAlight => "spark_alight",
        }
    }

    pub const fn name(self) -> &'static str {
        match self {
            Self::Brick => "Fire Brick",
            Self::Arthur => "Arthur, Young Heir",
            Self::KingdomInformant => "Kingdom Informant",
            Self::ClumsyApprentice => "Clumsy Apprentice",
            Self::SableRemnant => "Sable Remnant",
            Self::HastyMessenger => "Hasty Messenger",
            Self::RedHare => "Red Hare, Unrivaled Stallion",
            Self::IgnitedStab => "Ignited Stab",
            Self::RendingFlames => "Rending Flames",
            Self::BlazingThrow => "Blazing Throw",
            Self::CorhaziCourier => "Corhazi Courier",
            Self::VeteranBlazebearer => "Veteran Blazebearer",
            Self::Sadi => "Sadi, Blood Harvester",
            Self::CaptivatingCutthroat => "Captivating Cutthroat",
            Self::DazzlingCourtesan => "Dazzling Courtesan",
            Self::FieryInterference => "Fiery Interference",
            Self::HeatedVengeance => "Heated Vengeance",
            Self::IntensifiedPyre => "Intensified Pyre",
            Self::MarchHare => "March Hare, Mottled Host",
            Self::MarkTheTarget => "Mark the Target",
            Self::PepperedChef => "Peppered Chef",
            Self::PlantedExplosive => "Planted Explosive",
            Self::Rococo => "Rococo, Explosive Maven",
            Self::Tweedledum => "Tweedledum, Rattled Dancer",
            Self::VermilionDecree => "Vermilion Decree",
            Self::XiaoQiao => "Xiao Qiao, Cinderkeeper",
            Self::HotCake => "Hot Cake",
            Self::UncannyRealization => "Uncanny Realization",
            Self::Virgil => "Virgil, Altered Future",
            Self::ViciousSlice => "Vicious Slice",
            Self::ManicZealot => "Manic Zealot",
            Self::Demolition => "Demolition",
            Self::SurgingBolt => "Surging Bolt",
            Self::WoodlandSquirrels => "Woodland Squirrels",
            Self::DuchessSixOfHearts => "Duchess, Six of Hearts",
            Self::WanderingGlaivier => "Wandering Glaivier",
            Self::FlagrantGuide => "Flagrant Guide",
            Self::Gildas => "Gildas, Chronicler of Aesa",
            Self::Incapacitate => "Incapacitate",
            Self::LurkingAssailant => "Lurking Assailant",
            Self::UndeniableTruth => "Undeniable Truth",
            Self::CorhaziArsonist => "Corhazi Arsonist",
            Self::IgniteFate => "Ignite Fate",
            Self::IncreasingDanger => "Increasing Danger",
            Self::ReduceToAsh => "Reduce to Ash",
            Self::SmokeOut => "Smoke Out",
            Self::SparkAlight => "Spark Alight",
        }
    }

    pub const fn short(self) -> &'static str {
        match self {
            Self::Brick => "Brick",
            Self::Arthur => "Arthu",
            Self::KingdomInformant => "Kingd",
            Self::ClumsyApprentice => "Clums",
            Self::SableRemnant => "Sable",
            Self::HastyMessenger => "Hasty",
            Self::RedHare => "Red H",
            Self::IgnitedStab => "Ignit",
            Self::RendingFlames => "Rendi",
            Self::BlazingThrow => "Blazi",
            Self::CorhaziCourier => "Corha",
            Self::VeteranBlazebearer => "VBlaz",
            Self::Sadi => "Sadi",
            Self::CaptivatingCutthroat => "CaptC",
            Self::DazzlingCourtesan => "Dazzl",
            Self::FieryInterference => "FInt",
            Self::HeatedVengeance => "HeatV",
            Self::IntensifiedPyre => "IPyre",
            Self::MarchHare => "March",
            Self::MarkTheTarget => "MarkT",
            Self::PepperedChef => "PChef",
            Self::PlantedExplosive => "PExpl",
            Self::Rococo => "Rococ",
            Self::Tweedledum => "Tweed",
            Self::VermilionDecree => "VermD",
            Self::XiaoQiao => "XiaoQ",
            Self::HotCake => "HCake",
            Self::UncannyRealization => "UReal",
            Self::Virgil => "Virgi",
            Self::ViciousSlice => "VSlic",
            Self::ManicZealot => "Manic",
            Self::Demolition => "Demol",
            Self::SurgingBolt => "SBolt",
            Self::WoodlandSquirrels => "Sqrls",
            Self::DuchessSixOfHearts => "Duc6H",
            Self::WanderingGlaivier => "WGlaiv",
            Self::FlagrantGuide => "FGuid",
            Self::Gildas => "Gilda",
            Self::Incapacitate => "Incap",
            Self::LurkingAssailant => "Lurki",
            Self::UndeniableTruth => "Unden",
            Self::CorhaziArsonist => "Arson",
            Self::IgniteFate => "IFate",
            Self::IncreasingDanger => "IDang",
            Self::ReduceToAsh => "RtAsh",
            Self::SmokeOut => "Smoke",
            Self::SparkAlight => "Spark",
        }
    }

    pub const fn cost(self) -> u8 {
        match self {
            Self::WoodlandSquirrels => 0,
            Self::DuchessSixOfHearts => 6,
            Self::Brick => 9,
            Self::Arthur | Self::Incapacitate => 4,
            Self::CorhaziCourier
            | Self::Sadi
            | Self::DazzlingCourtesan
            | Self::HeatedVengeance
            | Self::IntensifiedPyre
            | Self::Tweedledum
            | Self::VermilionDecree
            | Self::RendingFlames
            | Self::VeteranBlazebearer
            | Self::HotCake
            | Self::Virgil
            | Self::Demolition
            | Self::SurgingBolt
            | Self::WanderingGlaivier
            | Self::FlagrantGuide
            | Self::Gildas
            | Self::LurkingAssailant
            | Self::CorhaziArsonist
            | Self::IgniteFate
            | Self::ReduceToAsh => 3,
            Self::KingdomInformant
            | Self::ClumsyApprentice
            | Self::SableRemnant
            | Self::HastyMessenger
            | Self::RedHare
            | Self::CaptivatingCutthroat
            | Self::FieryInterference
            | Self::PepperedChef
            | Self::PlantedExplosive
            | Self::XiaoQiao
            | Self::ManicZealot
            | Self::IncreasingDanger
            | Self::SparkAlight => 2,
            Self::IgnitedStab
            | Self::BlazingThrow
            | Self::MarchHare
            | Self::MarkTheTarget
            | Self::Rococo
            | Self::UncannyRealization
            | Self::ViciousSlice
            | Self::UndeniableTruth
            | Self::SmokeOut => 1,
        }
    }

    pub const fn power(self) -> u8 {
        match self {
            Self::DuchessSixOfHearts => 4,
            Self::Tweedledum | Self::RedHare | Self::RendingFlames | Self::UncannyRealization => 3,
            Self::Arthur
            | Self::IgnitedStab
            | Self::VeteranBlazebearer
            | Self::Sadi
            | Self::CaptivatingCutthroat
            | Self::DazzlingCourtesan
            | Self::HeatedVengeance
            | Self::PepperedChef
            | Self::Virgil
            | Self::ViciousSlice
            | Self::WanderingGlaivier
            | Self::LurkingAssailant
            | Self::CorhaziArsonist => 2,
            Self::KingdomInformant
            | Self::ClumsyApprentice
            | Self::SableRemnant
            | Self::HastyMessenger
            | Self::CorhaziCourier
            | Self::MarchHare
            | Self::Rococo
            | Self::XiaoQiao
            | Self::ManicZealot
            | Self::WoodlandSquirrels
            | Self::FlagrantGuide
            | Self::Gildas => 1,
            _ => 0,
        }
    }

    pub const fn is_ally(self) -> bool {
        matches!(
            self,
            Self::Arthur
                | Self::KingdomInformant
                | Self::ClumsyApprentice
                | Self::SableRemnant
                | Self::HastyMessenger
                | Self::RedHare
                | Self::CorhaziCourier
                | Self::VeteranBlazebearer
                | Self::Sadi
                | Self::CaptivatingCutthroat
                | Self::DazzlingCourtesan
                | Self::MarchHare
                | Self::PepperedChef
                | Self::Rococo
                | Self::Tweedledum
                | Self::XiaoQiao
                | Self::Virgil
                | Self::ManicZealot
                | Self::WoodlandSquirrels
                | Self::DuchessSixOfHearts
                | Self::WanderingGlaivier
                | Self::FlagrantGuide
                | Self::Gildas
                | Self::LurkingAssailant
                | Self::CorhaziArsonist
        )
    }

    pub const fn is_attack(self) -> bool {
        matches!(
            self,
            Self::IgnitedStab
                | Self::RendingFlames
                | Self::HeatedVengeance
                | Self::UncannyRealization
                | Self::ViciousSlice
        )
    }

    pub const fn is_action(self) -> bool {
        matches!(
            self,
            Self::BlazingThrow
                | Self::FieryInterference
                | Self::IntensifiedPyre
                | Self::MarkTheTarget
                | Self::PlantedExplosive
                | Self::VermilionDecree
                | Self::Demolition
                | Self::SurgingBolt
                | Self::Incapacitate
                | Self::UndeniableTruth
                | Self::IgniteFate
                | Self::IncreasingDanger
                | Self::ReduceToAsh
                | Self::SmokeOut
                | Self::SparkAlight
        )
    }

    pub const fn is_item(self) -> bool {
        matches!(self, Self::HotCake)
    }

    pub const fn is_fire(self) -> bool {
        !matches!(
            self,
            Self::KingdomInformant
                | Self::SableRemnant
                | Self::Sadi
                | Self::UncannyRealization
                | Self::Virgil
                | Self::ViciousSlice
                | Self::WoodlandSquirrels
                | Self::Gildas
                | Self::Incapacitate
                | Self::LurkingAssailant
                | Self::UndeniableTruth
        )
    }

    pub const fn is_automaton(self) -> bool {
        matches!(self, Self::Rococo | Self::Virgil | Self::ManicZealot)
    }

    /// Command Automaton attacks must be performed by an Automaton ally.
    pub const fn is_command_automaton(self) -> bool {
        matches!(self, Self::UncannyRealization)
    }

    pub const fn is_fast(self) -> bool {
        matches!(
            self,
            Self::Virgil
                | Self::Demolition
                | Self::Incapacitate
                | Self::UndeniableTruth
                | Self::ReduceToAsh
                | Self::SmokeOut
                | Self::SparkAlight
        )
    }

    pub const fn is_stealth(self) -> bool {
        matches!(
            self,
            Self::KingdomInformant | Self::CorhaziCourier | Self::XiaoQiao
        )
    }

    pub const fn assassin_stealth(self) -> bool {
        matches!(self, Self::Tweedledum)
    }

    pub const fn is_unique(self) -> bool {
        matches!(
            self,
            Self::Arthur
                | Self::RedHare
                | Self::Sadi
                | Self::MarchHare
                | Self::Rococo
                | Self::Tweedledum
                | Self::XiaoQiao
                | Self::Virgil
                | Self::DuchessSixOfHearts
                | Self::Gildas
        )
    }

    pub const fn floating_memory(self) -> bool {
        matches!(
            self,
            Self::KingdomInformant | Self::SableRemnant | Self::HotCake | Self::IgniteFate
        )
    }

    pub const fn kindle(self) -> u8 {
        match self {
            Self::DazzlingCourtesan | Self::IntensifiedPyre => 3,
            Self::DuchessSixOfHearts => 6,
            _ => 0,
        }
    }

    pub const fn prepare(self) -> u8 {
        match self {
            Self::PlantedExplosive => 1,
            _ => 0,
        }
    }

    /// Imbue N: card is imbued when at least N Fire cards are reserved for its cost.
    pub const fn imbue(self) -> u8 {
        match self {
            Self::VermilionDecree | Self::SurgingBolt => 3,
            _ => 0,
        }
    }

    /// Damage dealt to each champion when this ally dies to the graveyard.
    pub const fn on_death_damage(self) -> u8 {
        match self {
            Self::ManicZealot => 2,
            _ => 0,
        }
    }

    /// Optional champion level offered on enter (Flagrant Guide).
    pub const fn on_enter_level(self) -> bool {
        matches!(self, Self::FlagrantGuide)
    }

    /// Draw a card when this ally dies to the graveyard (self only; opponent draws are not modeled).
    pub const fn on_death_draw(self) -> bool {
        matches!(self, Self::WanderingGlaivier)
    }

    pub const fn life(self) -> Option<u8> {
        Some(match self {
            Self::Brick => return None,
            Self::Arthur => 3,
            Self::KingdomInformant => 2,
            Self::ClumsyApprentice => 1,
            Self::SableRemnant => 1,
            Self::HastyMessenger => 2,
            Self::RedHare => 3,
            Self::CorhaziCourier => 2,
            Self::VeteranBlazebearer => 3,
            Self::Sadi => 2,
            Self::CaptivatingCutthroat => 1,
            Self::DazzlingCourtesan => 2,
            Self::MarchHare => 1,
            Self::PepperedChef => 1,
            Self::Rococo => 1,
            Self::Tweedledum => 2,
            Self::XiaoQiao => 2,
            Self::Virgil => 2,
            Self::ManicZealot => 1,
            Self::WoodlandSquirrels => 1,
            Self::DuchessSixOfHearts => 2,
            Self::WanderingGlaivier => 1,
            Self::FlagrantGuide => 3,
            Self::Gildas | Self::LurkingAssailant => 3,
            Self::CorhaziArsonist => 2,
            _ => return None,
        })
    }

    pub const fn assassin_power_bonus(self) -> Option<u8> {
        match self {
            Self::SableRemnant | Self::CaptivatingCutthroat => Some(1),
            _ => None,
        }
    }

    pub const fn kind_label(self) -> &'static str {
        if self.is_ally() {
            "ally"
        } else if self.is_attack() {
            "attack"
        } else if self.is_action() {
            "action"
        } else if self.is_item() {
            "item"
        } else {
            "brick"
        }
    }

    pub const fn element(self) -> &'static str {
        if self.is_fire() { "fire" } else { "norm" }
    }

    /// Assassin action/attack eligible for Zander, Deft Executor graveyard return.
    pub const fn zander_gy_returnable(self) -> bool {
        self.is_attack() || self.is_action()
    }

    pub const fn is_playable(self) -> bool {
        !matches!(self, Self::Brick)
    }
}

pub const ALL_CARDS: [Card; CARD_COUNT] = [
    Card::Brick,
    Card::Arthur,
    Card::KingdomInformant,
    Card::ClumsyApprentice,
    Card::SableRemnant,
    Card::HastyMessenger,
    Card::RedHare,
    Card::IgnitedStab,
    Card::RendingFlames,
    Card::BlazingThrow,
    Card::CorhaziCourier,
    Card::VeteranBlazebearer,
    Card::Sadi,
    Card::CaptivatingCutthroat,
    Card::DazzlingCourtesan,
    Card::FieryInterference,
    Card::HeatedVengeance,
    Card::IntensifiedPyre,
    Card::MarchHare,
    Card::MarkTheTarget,
    Card::PepperedChef,
    Card::PlantedExplosive,
    Card::Rococo,
    Card::Tweedledum,
    Card::VermilionDecree,
    Card::XiaoQiao,
    Card::HotCake,
    Card::UncannyRealization,
    Card::Virgil,
    Card::ViciousSlice,
    Card::ManicZealot,
    Card::Demolition,
    Card::SurgingBolt,
    Card::WoodlandSquirrels,
    Card::DuchessSixOfHearts,
    Card::WanderingGlaivier,
    Card::FlagrantGuide,
    Card::Gildas,
    Card::Incapacitate,
    Card::LurkingAssailant,
    Card::UndeniableTruth,
    Card::CorhaziArsonist,
    Card::IgniteFate,
    Card::IncreasingDanger,
    Card::ReduceToAsh,
    Card::SmokeOut,
    Card::SparkAlight,
];

pub const PLAYABLE_CARDS: [Card; 46] = [
    Card::Arthur,
    Card::KingdomInformant,
    Card::ClumsyApprentice,
    Card::SableRemnant,
    Card::HastyMessenger,
    Card::RedHare,
    Card::IgnitedStab,
    Card::RendingFlames,
    Card::BlazingThrow,
    Card::CorhaziCourier,
    Card::VeteranBlazebearer,
    Card::Sadi,
    Card::CaptivatingCutthroat,
    Card::DazzlingCourtesan,
    Card::FieryInterference,
    Card::HeatedVengeance,
    Card::IntensifiedPyre,
    Card::MarchHare,
    Card::MarkTheTarget,
    Card::PepperedChef,
    Card::PlantedExplosive,
    Card::Rococo,
    Card::Tweedledum,
    Card::VermilionDecree,
    Card::XiaoQiao,
    Card::HotCake,
    Card::UncannyRealization,
    Card::Virgil,
    Card::ViciousSlice,
    Card::ManicZealot,
    Card::Demolition,
    Card::SurgingBolt,
    Card::WoodlandSquirrels,
    Card::DuchessSixOfHearts,
    Card::WanderingGlaivier,
    Card::FlagrantGuide,
    Card::Gildas,
    Card::Incapacitate,
    Card::LurkingAssailant,
    Card::UndeniableTruth,
    Card::CorhaziArsonist,
    Card::IgniteFate,
    Card::IncreasingDanger,
    Card::ReduceToAsh,
    Card::SmokeOut,
    Card::SparkAlight,
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct CardDef {
    pub id: &'static str,
    pub name: &'static str,
    pub short: &'static str,
    pub kind: &'static str,
    pub cost: u8,
    pub element: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub power: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub life: Option<u8>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub stealth: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub unique: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assassin_power_bonus: Option<u8>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub assassin_stealth: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub automaton: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub fast: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub floating_memory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kindle: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prepare: Option<u8>,
}

impl CardDef {
    pub const fn from_card(card: Card) -> Self {
        let kindle = card.kindle();
        let prepare = card.prepare();
        Self {
            id: card.id(),
            name: card.name(),
            short: card.short(),
            kind: card.kind_label(),
            cost: card.cost(),
            element: card.element(),
            power: {
                let power = card.power();
                if power > 0 { Some(power) } else { None }
            },
            life: card.life(),
            stealth: card.is_stealth(),
            unique: card.is_unique(),
            assassin_power_bonus: card.assassin_power_bonus(),
            assassin_stealth: card.assassin_stealth(),
            automaton: card.is_automaton(),
            fast: card.is_fast(),
            floating_memory: card.floating_memory(),
            kindle: if kindle > 0 { Some(kindle) } else { None },
            prepare: if prepare > 0 { Some(prepare) } else { None },
        }
    }
}

pub fn card_catalog() -> Vec<CardDef> {
    ALL_CARDS.iter().copied().map(CardDef::from_card).collect()
}

pub fn parse_card(value: &str) -> Option<Card> {
    let normalized = value
        .trim()
        .to_ascii_lowercase()
        .replace(|c: char| !c.is_ascii_alphanumeric(), "_")
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_");

    Some(match normalized.as_str() {
        "brick" | "fire_brick" => Card::Brick,
        "arthur" | "arthur_young_heir" => Card::Arthur,
        "kingdom_informant" => Card::KingdomInformant,
        "clumsy_apprentice" => Card::ClumsyApprentice,
        "sable_remnant" => Card::SableRemnant,
        "hasty_messenger" => Card::HastyMessenger,
        "red_hare" | "red_hare_unrivaled_stallion" => Card::RedHare,
        "ignited_stab" => Card::IgnitedStab,
        "rending_flames" => Card::RendingFlames,
        "blazing_throw" => Card::BlazingThrow,
        "corhazi_courier" | "kurhazi_courier" => Card::CorhaziCourier,
        "veteran_blazebearer" => Card::VeteranBlazebearer,
        "sadi" | "sadi_blood_harvester" => Card::Sadi,
        "captivating_cutthroat" => Card::CaptivatingCutthroat,
        "dazzling_courtesan" => Card::DazzlingCourtesan,
        "fiery_interference" => Card::FieryInterference,
        "heated_vengeance" => Card::HeatedVengeance,
        "intensified_pyre" => Card::IntensifiedPyre,
        "march_hare" | "march_hare_mottled_host" => Card::MarchHare,
        "mark_the_target" => Card::MarkTheTarget,
        "peppered_chef" => Card::PepperedChef,
        "planted_explosive" => Card::PlantedExplosive,
        "rococo" | "rococo_explosive_maven" => Card::Rococo,
        "tweedledum" | "tweedledum_rattled_dancer" => Card::Tweedledum,
        "vermilion_decree" => Card::VermilionDecree,
        "xiao_qiao" | "xiao_qiao_cinderkeeper" => Card::XiaoQiao,
        "hot_cake" => Card::HotCake,
        "uncanny_realization" => Card::UncannyRealization,
        "virgil" | "virgil_altered_future" => Card::Virgil,
        "vicious_slice" => Card::ViciousSlice,
        "manic_zealot" => Card::ManicZealot,
        "demolition" => Card::Demolition,
        "surging_bolt" => Card::SurgingBolt,
        "woodland_squirrels" => Card::WoodlandSquirrels,
        "duchess_six_of_hearts" => Card::DuchessSixOfHearts,
        "wandering_glaivier" => Card::WanderingGlaivier,
        "flagrant_guide" => Card::FlagrantGuide,
        "gildas" | "gildas_chronicler_of_aesa" => Card::Gildas,
        "incapacitate" => Card::Incapacitate,
        "lurking_assailant" => Card::LurkingAssailant,
        "undeniable_truth" => Card::UndeniableTruth,
        "corhazi_arsonist" => Card::CorhaziArsonist,
        "ignite_fate" => Card::IgniteFate,
        "increasing_danger" => Card::IncreasingDanger,
        "reduce_to_ash" => Card::ReduceToAsh,
        "smoke_out" => Card::SmokeOut,
        "spark_alight" | "aenean_spark_alight" => Card::SparkAlight,
        _ => return None,
    })
}
