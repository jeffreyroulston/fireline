use crate::cards::ALL_CARDS;
use serde::{Serialize, Serializer};

#[cfg(feature = "ts")]
use ts_rs::TS;

/// Manual bump when solver / model semantics change.
pub const RULES_VERSION: u32 = 43;
/// Manual bump when RNG, shuffle, or seed derivation changes.
pub const SAMPLER_VERSION: u32 = 1;
/// Manual bump when stats attribution labels or parsing changes.
pub const ATTRIBUTION_VERSION: u32 = 8;

fn serialize_u64_as_string<S: Serializer>(value: &u64, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(&value.to_string())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct EngineVersion {
    pub rules: u32,
    pub sampler: u32,
    pub attribution: u32,
    /// Serialized as a decimal string so JS clients keep full u64 precision.
    #[serde(serialize_with = "serialize_u64_as_string")]
    #[cfg_attr(feature = "ts", ts(type = "string"))]
    pub card_digest: u64,
    pub build: &'static str,
}

impl EngineVersion {
    pub const fn current() -> Self {
        Self {
            rules: RULES_VERSION,
            sampler: SAMPLER_VERSION,
            attribution: ATTRIBUTION_VERSION,
            card_digest: compute_card_digest(),
            build: match option_env!("GIT_SHA") {
                Some(value) => value,
                None => "dev",
            },
        }
    }
}

pub const ENGINE_VERSION: EngineVersion = EngineVersion::current();

const fn fnv1a_byte(mut hash: u64, byte: u8) -> u64 {
    hash ^= byte as u64;
    hash.wrapping_mul(1099511628211)
}

const fn fnv1a_bytes(mut hash: u64, bytes: &[u8]) -> u64 {
    let mut index = 0;
    while index < bytes.len() {
        hash = fnv1a_byte(hash, bytes[index]);
        index += 1;
    }
    hash
}

const fn fnv1a_bool(hash: u64, value: bool) -> u64 {
    fnv1a_byte(hash, if value { 1 } else { 0 })
}

/// Stable digest of every card attribute that affects simulation or attribution.
pub const fn compute_card_digest() -> u64 {
    const OFFSET: u64 = 14695981039346656037;
    let mut hash = OFFSET;
    let mut index = 0;
    while index < ALL_CARDS.len() {
        let card = ALL_CARDS[index];
        hash = fnv1a_bytes(hash, card.id().as_bytes());
        hash = fnv1a_byte(hash, card.cost());
        hash = fnv1a_byte(hash, card.power());
        hash = fnv1a_bool(hash, card.is_ally());
        hash = fnv1a_bool(hash, card.is_attack());
        hash = fnv1a_bool(hash, card.is_action());
        hash = fnv1a_bool(hash, card.is_item());
        hash = fnv1a_bool(hash, card.is_fire());
        hash = fnv1a_bool(hash, card.is_stealth());
        hash = fnv1a_bool(hash, card.assassin_stealth());
        hash = fnv1a_bool(hash, card.is_automaton());
        hash = fnv1a_bool(hash, card.is_command_automaton());
        hash = fnv1a_bool(hash, card.is_fast());
        hash = fnv1a_bool(hash, card.is_unique());
        hash = fnv1a_bool(hash, card.floating_memory());
        hash = fnv1a_byte(hash, card.kindle());
        hash = fnv1a_byte(hash, card.prepare());
        hash = fnv1a_byte(hash, card.imbue());
        hash = fnv1a_byte(hash, card.on_death_damage());
        hash = fnv1a_bool(hash, card.on_death_draw());
        hash = fnv1a_bool(hash, card.on_enter_level());
        index += 1;
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn card_digest_is_stable() {
        assert_eq!(compute_card_digest(), 2_213_601_815_118_129_714);
    }

    #[test]
    fn engine_version_matches_manual_triple_and_digest() {
        let version = ENGINE_VERSION;
        assert_eq!(version.rules, RULES_VERSION);
        assert_eq!(version.sampler, SAMPLER_VERSION);
        assert_eq!(version.attribution, ATTRIBUTION_VERSION);
        assert_eq!(version.card_digest, compute_card_digest());
    }
}
