//! Catalog entry + exported [`CardDef`] for workers / TS.

use serde::Serialize;

#[cfg(feature = "ts")]
use ts_rs::TS;

use super::effects::Effect;
use super::keywords::{
    Keyword, keywords_assassin_power_bonus, keywords_assassin_stealth, keywords_automaton,
    keywords_command_automaton, keywords_fast, keywords_floating_memory, keywords_imbue,
    keywords_kindle, keywords_on_death_damage, keywords_on_death_draw, keywords_on_enter_level,
    keywords_prepare, keywords_stealth, keywords_unique,
};
use super::kind::CardKind;
use super::Card;

/// One row in the card registry — stats, keywords, and composed powers.
#[derive(Clone, Copy, Debug)]
pub struct CatalogEntry {
    pub card: Card,
    pub id: &'static str,
    pub name: &'static str,
    pub short: &'static str,
    pub kind: CardKind,
    pub cost: u8,
    pub fire: bool,
    pub power: u8,
    pub life: Option<u8>,
    pub keywords: &'static [Keyword],
    pub aliases: &'static [&'static str],
    /// On-play effects for actions (and similar). Empty → no-op or snowflake.
    pub on_play: &'static [Effect],
    /// Ally enter-the-battlefield effects. Interactive ETBs stay as snowflakes in apply.
    pub on_enter: &'static [Effect],
}

impl CatalogEntry {
    pub const fn is_ally(self) -> bool {
        matches!(self.kind, CardKind::Ally)
    }

    pub const fn is_attack(self) -> bool {
        matches!(self.kind, CardKind::Attack)
    }

    pub const fn is_action(self) -> bool {
        matches!(self.kind, CardKind::Action)
    }

    pub const fn is_item(self) -> bool {
        matches!(self.kind, CardKind::Item)
    }

    pub const fn is_brick(self) -> bool {
        matches!(self.kind, CardKind::Brick)
    }

    pub const fn is_playable(self) -> bool {
        !self.is_brick()
    }

    pub const fn element(self) -> &'static str {
        if self.fire { "fire" } else { "norm" }
    }

    pub const fn is_stealth(self) -> bool {
        keywords_stealth(self.keywords)
    }

    pub const fn assassin_stealth(self) -> bool {
        keywords_assassin_stealth(self.keywords)
    }

    pub const fn is_unique(self) -> bool {
        keywords_unique(self.keywords)
    }

    pub const fn is_fast(self) -> bool {
        keywords_fast(self.keywords)
    }

    pub const fn floating_memory(self) -> bool {
        keywords_floating_memory(self.keywords)
    }

    pub const fn is_automaton(self) -> bool {
        keywords_automaton(self.keywords)
    }

    pub const fn is_command_automaton(self) -> bool {
        keywords_command_automaton(self.keywords)
    }

    pub const fn on_death_draw(self) -> bool {
        keywords_on_death_draw(self.keywords)
    }

    pub const fn on_enter_level(self) -> bool {
        keywords_on_enter_level(self.keywords)
    }

    pub const fn kindle(self) -> u8 {
        keywords_kindle(self.keywords)
    }

    pub const fn prepare(self) -> u8 {
        keywords_prepare(self.keywords)
    }

    pub const fn imbue(self) -> u8 {
        keywords_imbue(self.keywords)
    }

    pub const fn on_death_damage(self) -> u8 {
        keywords_on_death_damage(self.keywords)
    }

    pub const fn assassin_power_bonus(self) -> Option<u8> {
        keywords_assassin_power_bonus(self.keywords)
    }
}

/// Wire / UI catalog row (camelCase JSON, ts-rs).
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
    pub const fn from_entry(entry: &CatalogEntry) -> Self {
        let kindle = entry.kindle();
        let prepare = entry.prepare();
        Self {
            id: entry.id,
            name: entry.name,
            short: entry.short,
            kind: entry.kind.label(),
            cost: entry.cost,
            element: entry.element(),
            power: if entry.power > 0 {
                Some(entry.power)
            } else {
                None
            },
            life: entry.life,
            stealth: entry.is_stealth(),
            unique: entry.is_unique(),
            assassin_power_bonus: entry.assassin_power_bonus(),
            assassin_stealth: entry.assassin_stealth(),
            automaton: entry.is_automaton(),
            fast: entry.is_fast(),
            floating_memory: entry.floating_memory(),
            kindle: if kindle > 0 { Some(kindle) } else { None },
            prepare: if prepare > 0 { Some(prepare) } else { None },
        }
    }
}
