//! Card identity, catalog registry, and property accessors.

mod catalog;
mod def;
mod effects;
mod keywords;
mod kind;
pub mod snowflakes;

pub use def::{CardDef, CatalogEntry};
pub use effects::{Cond, CondContext, Effect, EffectPlan};
pub use keywords::Keyword;
pub use kind::CardKind;

pub use catalog::CATALOG;
use serde::{Deserialize, Serialize};

pub const CARD_COUNT: usize = 126;

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
    PackageCourier = 47,
    FlurryOfFire = 48,
    CreativeShock = 49,
Fireball = 50,
    SpontaneousCombustion = 51,
    FocusedFlames = 52,
    StraightFlare = 53,
    ScorchingKnowledge = 54,
    SetAblaze = 55,
    ThermalBreak = 56,
    BlazeAlight = 57,
    PurgeInFlames = 58,
    Disintegrate = 59,
    FoundPower = 60,
    CremationRitual = 61,
    MoltenEcho = 62,
    RestoringEmbers = 63,
    RapidCombustion = 64,
    SilentFirebrand = 65,
    BurningAethercharge = 66,
    SpurnToAsh = 67,
    Excoriate = 68,
    InnervateFury = 69,
    AshenRiffle = 70,
    CreativeTinder = 71,
    Lavastorm = 72,
    Thunderclap = 73,
    GildedPyre = 74,
    Escharotomy = 75,
    PyroclasticFlow = 76,
    EruptingRhapsody = 77,
    SacredEngulfment = 78,
    SolarPinnacle = 79,
    IgniteSoul = 80,
    AeneanPointedFlare = 81,
    AeneanScorchingComet = 82,
    FlaredIridescence = 83,
    PyreticPrognosis = 84,
    EquanimitySAshes = 85,
    ScorchedConquest = 86,
    ClaudeFatedVisionary = 87,
    CordeliaAurousKaiser = 88,
    HarvesterMkII = 89,
    OverlordMkIII = 90,
    AcademyAttendant = 91,
    CellProduction = 92,
    ManufactureCell = 93,
    TuneUp = 94,
    TurboCharge = 95,
    CounterInterference = 96,
    CriticalRecovery = 97,
    Reprogram = 98,
    Powercell = 99,
    AutomatonDrone = 100,
    AutomatedGardener = 101,
    CaretakerDrone = 102,
    FurnaceDrone = 103,
    FiretunedAutomaton = 104,
    PoweredSentinel = 105,
    PoweredDefender = 106,
    Shieldroid = 107,
    NoviceMechanist = 108,
    CellConverter = 109,
    CellAssembler = 110,
    CellGenerator = 111,
    CellForging = 112,
    ReactivateDrone = 113,
    SummonSentinels = 114,
    BolsterRanks = 115,
    AssembleAncients = 116,
    TriumphantMechanic = 117,
    SordelleUnmooredException = 118,
    GeniGiftedMechanist = 119,
    InzaliUnshackledBlaze = 120,
    VoldaSmolderSSpite = 121,
    HectorPraetorianGuard = 122,
    AtmosArmorTypeAres = 123,
    AtmosArmorTypeHermes = 124,
    TitanMkII = 125,
}

impl Card {
    #[inline]
    pub const fn index(self) -> usize {
        self as usize
    }

    #[inline]
    pub const fn entry(self) -> &'static CatalogEntry {
        &CATALOG[self.index()]
    }

    pub const fn id(self) -> &'static str {
        self.entry().id
    }

    pub const fn name(self) -> &'static str {
        self.entry().name
    }

    pub const fn short(self) -> &'static str {
        self.entry().short
    }

    pub const fn cost(self) -> u8 {
        self.entry().cost
    }

    pub const fn power(self) -> u8 {
        self.entry().power
    }

    pub const fn is_ally(self) -> bool {
        self.entry().is_ally()
    }

    pub const fn is_attack(self) -> bool {
        self.entry().is_attack()
    }

    pub const fn is_action(self) -> bool {
        self.entry().is_action()
    }

    pub const fn is_item(self) -> bool {
        self.entry().is_item()
    }

    pub const fn is_fire(self) -> bool {
        self.entry().fire
    }

    pub const fn is_automaton(self) -> bool {
        self.entry().is_automaton()
    }

    /// Command Automaton attacks must be performed by an Automaton ally.
    pub const fn is_command_automaton(self) -> bool {
        self.entry().is_command_automaton()
    }

    pub const fn is_fast(self) -> bool {
        self.entry().is_fast()
    }

    pub const fn is_stealth(self) -> bool {
        self.entry().is_stealth()
    }

    pub const fn is_taunt(self) -> bool {
        self.entry().is_taunt()
    }

    pub const fn is_true_sight(self) -> bool {
        self.entry().is_true_sight()
    }

    pub const fn assassin_stealth(self) -> bool {
        self.entry().assassin_stealth()
    }

    pub const fn is_unique(self) -> bool {
        self.entry().is_unique()
    }

    pub const fn floating_memory(self) -> bool {
        self.entry().floating_memory()
    }

    pub const fn kindle(self) -> u8 {
        self.entry().kindle()
    }

    pub const fn prepare(self) -> u8 {
        self.entry().prepare()
    }

    /// Imbue N: card is imbued when at least N Fire cards are reserved for its cost.
    pub const fn imbue(self) -> u8 {
        self.entry().imbue()
    }

    /// Damage dealt to each champion when this ally dies to the graveyard.
    pub const fn on_death_damage(self) -> u8 {
        self.entry().on_death_damage()
    }

    /// Optional champion level offered on enter (Flagrant Guide).
    pub const fn on_enter_level(self) -> bool {
        self.entry().on_enter_level()
    }

    /// Draw a card when this ally dies to the graveyard (self only; opponent draws are not modeled).
    pub const fn on_death_draw(self) -> bool {
        self.entry().on_death_draw()
    }

    pub const fn life(self) -> Option<u8> {
        self.entry().life
    }

    pub const fn assassin_power_bonus(self) -> Option<u8> {
        self.entry().assassin_power_bonus()
    }

    pub const fn kind_label(self) -> &'static str {
        self.entry().kind.label()
    }

    pub const fn element(self) -> &'static str {
        self.entry().element()
    }

    /// Assassin action/attack eligible for Zander, Deft Executor graveyard return.
    pub const fn zander_gy_returnable(self) -> bool {
        self.is_attack() || self.is_action()
    }

    pub const fn is_playable(self) -> bool {
        self.entry().is_playable()
    }

    pub const fn on_play(self) -> &'static [Effect] {
        self.entry().on_play
    }

    pub const fn on_enter(self) -> &'static [Effect] {
        self.entry().on_enter
    }

    /// Playable via [`crate::model::Action::PlayAction`] (excludes Blazing Throw).
    pub const fn is_play_action(self) -> bool {
        self.is_action() && !matches!(self, Self::BlazingThrow)
    }

    /// Whether `on_play` includes a damage primitive (optimistic threat / dagger paths).
    pub const fn on_play_deals_damage(self) -> bool {
        let effects = self.on_play();
        let mut index = 0;
        while index < effects.len() {
            match effects[index] {
                Effect::Damage(n) if n > 0 => return true,
                Effect::DamageIf { then_n, else_n, .. } if then_n > 0 || else_n > 0 => {
                    return true;
                }
                Effect::DamageRepeated { amount, times } if amount > 0 && times > 0 => {
                    return true;
                }
                _ => {}
            }
            index += 1;
        }
        false
    }

    /// Draw / prep / discard actions with no modeled damage (solver refuse-last-hand).
    pub const fn is_pure_draw_action(self) -> bool {
        if self.on_play_deals_damage() || self.on_play().is_empty() {
            return false;
        }
        let effects = self.on_play();
        let mut index = 0;
        while index < effects.len() {
            match effects[index] {
                Effect::Draw
                | Effect::DrawIf { .. }
                | Effect::DrawToMemory
                | Effect::DiscardForEffect
                | Effect::AddPrep(_)
                | Effect::AddPrepIf { .. } => return true,
                _ => {}
            }
            index += 1;
        }
        false
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
    Card::PackageCourier,
    Card::FlurryOfFire,
    Card::CreativeShock,
Card::Fireball,
    Card::SpontaneousCombustion,
    Card::FocusedFlames,
    Card::StraightFlare,
    Card::ScorchingKnowledge,
    Card::SetAblaze,
    Card::ThermalBreak,
    Card::BlazeAlight,
    Card::PurgeInFlames,
    Card::Disintegrate,
    Card::FoundPower,
    Card::CremationRitual,
    Card::MoltenEcho,
    Card::RestoringEmbers,
    Card::RapidCombustion,
    Card::SilentFirebrand,
    Card::BurningAethercharge,
    Card::SpurnToAsh,
    Card::Excoriate,
    Card::InnervateFury,
    Card::AshenRiffle,
    Card::CreativeTinder,
    Card::Lavastorm,
    Card::Thunderclap,
    Card::GildedPyre,
    Card::Escharotomy,
    Card::PyroclasticFlow,
    Card::EruptingRhapsody,
    Card::SacredEngulfment,
    Card::SolarPinnacle,
    Card::IgniteSoul,
    Card::AeneanPointedFlare,
    Card::AeneanScorchingComet,
    Card::FlaredIridescence,
    Card::PyreticPrognosis,
    Card::EquanimitySAshes,
    Card::ScorchedConquest,
    Card::ClaudeFatedVisionary,
    Card::CordeliaAurousKaiser,
    Card::HarvesterMkII,
    Card::OverlordMkIII,
    Card::AcademyAttendant,
    Card::CellProduction,
    Card::ManufactureCell,
    Card::TuneUp,
    Card::TurboCharge,
    Card::CounterInterference,
    Card::CriticalRecovery,
    Card::Reprogram,
    Card::Powercell,
    Card::AutomatonDrone,
    Card::AutomatedGardener,
    Card::CaretakerDrone,
    Card::FurnaceDrone,
    Card::FiretunedAutomaton,
    Card::PoweredSentinel,
    Card::PoweredDefender,
    Card::Shieldroid,
    Card::NoviceMechanist,
    Card::CellConverter,
    Card::CellAssembler,
    Card::CellGenerator,
    Card::CellForging,
    Card::ReactivateDrone,
    Card::SummonSentinels,
    Card::BolsterRanks,
    Card::AssembleAncients,
    Card::TriumphantMechanic,
    Card::SordelleUnmooredException,
    Card::GeniGiftedMechanist,
    Card::InzaliUnshackledBlaze,
    Card::VoldaSmolderSSpite,
    Card::HectorPraetorianGuard,
    Card::AtmosArmorTypeAres,
    Card::AtmosArmorTypeHermes,
    Card::TitanMkII,
];

pub const PLAYABLE_CARDS: [Card; 122] = [
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
    Card::PackageCourier,
    Card::FlurryOfFire,
    Card::CreativeShock,
Card::Fireball,
    Card::SpontaneousCombustion,
    Card::FocusedFlames,
    Card::StraightFlare,
    Card::ScorchingKnowledge,
    Card::SetAblaze,
    Card::ThermalBreak,
    Card::BlazeAlight,
    Card::PurgeInFlames,
    Card::Disintegrate,
    Card::FoundPower,
    Card::CremationRitual,
    Card::MoltenEcho,
    Card::RestoringEmbers,
    Card::RapidCombustion,
    Card::SilentFirebrand,
    Card::BurningAethercharge,
    Card::SpurnToAsh,
    Card::Excoriate,
    Card::InnervateFury,
    Card::AshenRiffle,
    Card::CreativeTinder,
    Card::Lavastorm,
    Card::Thunderclap,
    Card::GildedPyre,
    Card::Escharotomy,
    Card::PyroclasticFlow,
    Card::EruptingRhapsody,
    Card::SacredEngulfment,
    Card::SolarPinnacle,
    Card::IgniteSoul,
    Card::AeneanPointedFlare,
    Card::AeneanScorchingComet,
    Card::FlaredIridescence,
    Card::PyreticPrognosis,
    Card::EquanimitySAshes,
    Card::ScorchedConquest,
    Card::ClaudeFatedVisionary,
    Card::CordeliaAurousKaiser,
    Card::HarvesterMkII,
    Card::OverlordMkIII,
    Card::AcademyAttendant,
    Card::CellProduction,
    Card::ManufactureCell,
    Card::TuneUp,
    Card::TurboCharge,
    Card::CounterInterference,
    Card::CriticalRecovery,
    Card::Reprogram,
    Card::AutomatedGardener,
    Card::CaretakerDrone,
    Card::FurnaceDrone,
    Card::FiretunedAutomaton,
    Card::PoweredSentinel,
    Card::PoweredDefender,
    Card::Shieldroid,
    Card::NoviceMechanist,
    Card::CellConverter,
    Card::CellAssembler,
    Card::CellGenerator,
    Card::CellForging,
    Card::ReactivateDrone,
    Card::SummonSentinels,
    Card::BolsterRanks,
    Card::AssembleAncients,
    Card::TriumphantMechanic,
    Card::SordelleUnmooredException,
    Card::GeniGiftedMechanist,
    Card::InzaliUnshackledBlaze,
    Card::VoldaSmolderSSpite,
    Card::HectorPraetorianGuard,
    Card::AtmosArmorTypeAres,
    Card::AtmosArmorTypeHermes,
];

pub fn card_catalog() -> Vec<CardDef> {
    ALL_CARDS
        .iter()
        .copied()
        .map(|card| CardDef::from_entry(card.entry()))
        .collect()
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

    for entry in &CATALOG {
        if entry.id == normalized {
            return Some(entry.card);
        }
        for alias in entry.aliases {
            if *alias == normalized {
                return Some(entry.card);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{ALL_CARDS, CARD_COUNT, CATALOG, Card, parse_card};

    #[test]
    fn card_count_matches_enum() {
        assert_eq!(CARD_COUNT, 126);
        assert_eq!(Card::TitanMkII.index(), CARD_COUNT - 1);
    }

    #[test]
    fn catalog_order_matches_discriminant() {
        for (index, entry) in CATALOG.iter().enumerate() {
            assert_eq!(entry.card.index(), index);
            assert_eq!(ALL_CARDS[index], entry.card);
        }
    }

    #[test]
    fn parse_card_accepts_aliases() {
        assert_eq!(parse_card("Fire Brick"), Some(Card::Brick));
        assert_eq!(parse_card("kurhazi_courier"), Some(Card::CorhaziCourier));
        assert_eq!(
            parse_card("aenean_flurry_of_fire"),
            Some(Card::FlurryOfFire)
        );
        assert_eq!(parse_card("aenean_spark_alight"), Some(Card::SparkAlight));
    }
}
