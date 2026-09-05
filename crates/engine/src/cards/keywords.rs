//! Intrinsic keywords with one implementation each (GA-style).

/// Keyword / intrinsic printed on a card. Behavior lives in keyword handlers,
/// not per-card branches.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Keyword {
    Stealth,
    AssassinStealth,
    Taunt,
    TrueSight,
    Unique,
    Fast,
    FloatingMemory,
    Automaton,
    CommandAutomaton,
    Kindle(u8),
    Prepare(u8),
    Imbue(u8),
    OnDeathDamage(u8),
    OnDeathDraw,
    OnEnterLevel,
    AssassinPowerBonus(u8),
}

pub const fn keywords_stealth(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::Stealth) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_assassin_stealth(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::AssassinStealth) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_taunt(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::Taunt) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_true_sight(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::TrueSight) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_unique(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::Unique) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_fast(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::Fast) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_floating_memory(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::FloatingMemory) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_automaton(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::Automaton) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_command_automaton(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::CommandAutomaton) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_on_death_draw(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::OnDeathDraw) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_on_enter_level(keywords: &[Keyword]) -> bool {
    let mut index = 0;
    while index < keywords.len() {
        if matches!(keywords[index], Keyword::OnEnterLevel) {
            return true;
        }
        index += 1;
    }
    false
}

pub const fn keywords_kindle(keywords: &[Keyword]) -> u8 {
    let mut index = 0;
    while index < keywords.len() {
        if let Keyword::Kindle(n) = keywords[index] {
            return n;
        }
        index += 1;
    }
    0
}

pub const fn keywords_prepare(keywords: &[Keyword]) -> u8 {
    let mut index = 0;
    while index < keywords.len() {
        if let Keyword::Prepare(n) = keywords[index] {
            return n;
        }
        index += 1;
    }
    0
}

pub const fn keywords_imbue(keywords: &[Keyword]) -> u8 {
    let mut index = 0;
    while index < keywords.len() {
        if let Keyword::Imbue(n) = keywords[index] {
            return n;
        }
        index += 1;
    }
    0
}

pub const fn keywords_on_death_damage(keywords: &[Keyword]) -> u8 {
    let mut index = 0;
    while index < keywords.len() {
        if let Keyword::OnDeathDamage(n) = keywords[index] {
            return n;
        }
        index += 1;
    }
    0
}

pub const fn keywords_assassin_power_bonus(keywords: &[Keyword]) -> Option<u8> {
    let mut index = 0;
    while index < keywords.len() {
        if let Keyword::AssassinPowerBonus(n) = keywords[index] {
            return Some(n);
        }
        index += 1;
    }
    None
}
