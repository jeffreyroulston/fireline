use serde::{Deserialize, Serialize};

pub const CARD_COUNT: usize = 28;

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
    Racoo = 10,
    CorhaziCourier = 11,
    VeteranBlazebearer = 12,
    Sadi = 13,
    CaptivatingCutthroat = 14,
    DazzlingCourtesan = 15,
    FieryInterference = 16,
    HeatedVengeance = 17,
    IntensifiedPyre = 18,
    MarchHare = 19,
    MarkTheTarget = 20,
    PepperedChef = 21,
    PlantedExplosive = 22,
    Rococo = 23,
    Tweedledum = 24,
    VermilionDecree = 25,
    XiaoQiao = 26,
    HotCake = 27,
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
            Self::Racoo => "racoo",
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
            Self::Racoo => "Racoo, Aggro Extender",
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
            Self::Racoo => "Racoo",
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
        }
    }

    pub const fn cost(self) -> u8 {
        match self {
            Self::Brick => 9,
            Self::Arthur => 4,
            Self::CorhaziCourier
            | Self::Sadi
            | Self::DazzlingCourtesan
            | Self::HeatedVengeance
            | Self::IntensifiedPyre
            | Self::Tweedledum
            | Self::VermilionDecree
            | Self::RendingFlames
            | Self::VeteranBlazebearer
            | Self::HotCake => 3,
            Self::KingdomInformant
            | Self::ClumsyApprentice
            | Self::SableRemnant
            | Self::HastyMessenger
            | Self::RedHare
            | Self::Racoo
            | Self::CaptivatingCutthroat
            | Self::FieryInterference
            | Self::PepperedChef
            | Self::PlantedExplosive
            | Self::XiaoQiao => 2,
            Self::IgnitedStab
            | Self::BlazingThrow
            | Self::MarchHare
            | Self::MarkTheTarget
            | Self::Rococo => 1,
        }
    }

    pub const fn power(self) -> u8 {
        match self {
            Self::Tweedledum | Self::RedHare | Self::RendingFlames => 3,
            Self::Arthur
            | Self::IgnitedStab
            | Self::VeteranBlazebearer
            | Self::Sadi
            | Self::CaptivatingCutthroat
            | Self::DazzlingCourtesan
            | Self::HeatedVengeance
            | Self::PepperedChef => 2,
            Self::KingdomInformant
            | Self::ClumsyApprentice
            | Self::SableRemnant
            | Self::HastyMessenger
            | Self::Racoo
            | Self::CorhaziCourier
            | Self::MarchHare
            | Self::Rococo
            | Self::XiaoQiao => 1,
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
                | Self::Racoo
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
        )
    }

    pub const fn is_attack(self) -> bool {
        matches!(
            self,
            Self::IgnitedStab | Self::RendingFlames | Self::HeatedVengeance
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
        )
    }

    pub const fn is_item(self) -> bool {
        matches!(self, Self::HotCake)
    }

    pub const fn is_fire(self) -> bool {
        !matches!(
            self,
            Self::KingdomInformant | Self::SableRemnant | Self::Sadi
        )
    }

    pub const fn is_stealth(self) -> bool {
        matches!(
            self,
            Self::KingdomInformant
                | Self::Racoo
                | Self::CorhaziCourier
                | Self::Tweedledum
                | Self::XiaoQiao
        )
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
        )
    }

    pub const fn floating_memory(self) -> bool {
        matches!(
            self,
            Self::KingdomInformant | Self::SableRemnant | Self::HotCake
        )
    }

    pub const fn kindle(self) -> u8 {
        match self {
            Self::DazzlingCourtesan | Self::IntensifiedPyre => 3,
            _ => 0,
        }
    }

    pub const fn prepare(self) -> u8 {
        match self {
            Self::PlantedExplosive => 1,
            _ => 0,
        }
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
    Card::Racoo,
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
];

pub const PLAYABLE_CARDS: [Card; 27] = [
    Card::Arthur,
    Card::KingdomInformant,
    Card::ClumsyApprentice,
    Card::SableRemnant,
    Card::HastyMessenger,
    Card::RedHare,
    Card::IgnitedStab,
    Card::RendingFlames,
    Card::BlazingThrow,
    Card::Racoo,
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
];

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
        "racoo" | "racoo_aggro_extender" => Card::Racoo,
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
        _ => return None,
    })
}
