//! Deck bounds validation and legal-composition counting.

use crate::cards::Card;
use crate::error::{EngineError, Result};
use crate::random::Rng;
use std::collections::BTreeMap;

use super::types::*;
use crate::model::Bounds;

/// Number of legal count vectors inside `bounds` that sum to `deck_size`.
///
/// # Errors
///
/// Returns [`EngineError::InvalidRequest`] when bounds are empty, inconsistent, or cannot
/// produce a deck of the requested size.
pub fn count_legal_decks(bounds: &BTreeMap<String, Bounds>, deck_size: u8) -> Result<u64> {
    validate_bounds(bounds, deck_size)?;
    let ranges = bounds
        .values()
        .map(|bound| (bound.min, bound.max))
        .collect::<Vec<_>>();
    Ok(count_compositions(&ranges, deck_size))
}

pub(crate) fn counts_key(counts: &BTreeMap<String, u8>) -> Vec<u8> {
    counts.values().copied().collect()
}

fn validate_bounds(bounds: &BTreeMap<String, Bounds>, deck_size: u8) -> Result<()> {
    if bounds.is_empty() {
        return Err(EngineError::invalid(
            "bounds must include at least one card",
        ));
    }
    for id in bounds.keys() {
        crate::cards::parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone()))?;
    }
    let min_total: u16 = bounds.values().map(|bound| u16::from(bound.min)).sum();
    let max_total: u16 = bounds.values().map(|bound| u16::from(bound.max)).sum();
    if u16::from(deck_size) < min_total || u16::from(deck_size) > max_total {
        return Err(EngineError::invalid(format!(
            "deck size must be between bound totals {min_total} and {max_total}"
        )));
    }
    for bound in bounds.values() {
        if bound.min > bound.max {
            return Err(EngineError::invalid("each card minimum must be <= maximum"));
        }
    }
    Ok(())
}

fn count_compositions(ranges: &[(u8, u8)], deck_size: u8) -> u64 {
    let size = deck_size as usize;
    let mut dp = vec![0_u64; size + 1];
    dp[0] = 1;
    for &(lo, hi) in ranges {
        let mut prefix = vec![0_u128; size + 2];
        for index in 0..=size {
            prefix[index + 1] = prefix[index] + u128::from(dp[index]);
        }
        let mut next = vec![0_u64; size + 1];
        for (sum, slot) in next.iter_mut().enumerate() {
            let right = sum as isize - isize::from(lo);
            let left = sum as isize - isize::from(hi);
            if right < 0 {
                continue;
            }
            let left = left.max(0) as usize;
            let right = (right as usize).min(size);
            if left <= right {
                let total = prefix[right + 1] - prefix[left];
                *slot = u64::try_from(total).unwrap_or(u64::MAX);
            }
        }
        dp = next;
    }
    dp[size]
}

pub(crate) fn consider_top(
    top: &mut Vec<(f64, BTreeMap<String, u8>, Vec<crate::stats::CardStat>)>,
    score: f64,
    counts: &BTreeMap<String, u8>,
    card_stats: Vec<crate::stats::CardStat>,
) {
    if let Some(existing) = top.iter_mut().find(|(_, known, _)| known == counts) {
        if score > existing.0 {
            existing.0 = score;
            existing.2 = card_stats;
            top.sort_by(|left, right| {
                right
                    .0
                    .partial_cmp(&left.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        return;
    }
    if top.len() < 5 || top.last().is_some_and(|(worst, _, _)| score > *worst) {
        top.push((score, counts.clone(), card_stats));
        top.sort_by(|left, right| {
            right
                .0
                .partial_cmp(&left.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        top.truncate(5);
    }
}

pub(crate) fn ranked_decks(
    top: &[(f64, BTreeMap<String, u8>, Vec<crate::stats::CardStat>)],
) -> Vec<RankedDeck> {
    top.iter()
        .enumerate()
        .map(|(index, (score, counts, card_stats))| RankedDeck {
            rank: (index + 1) as u8,
            score: *score,
            counts: counts.clone(),
            score_delta: None,
            card_stats: card_stats.clone(),
            candidate: None,
        })
        .collect()
}

pub(crate) fn parse_counts(counts: &BTreeMap<String, u8>) -> Result<Vec<Card>> {
    let mut deck = Vec::new();
    for (id, &count) in counts {
        let card =
            crate::cards::parse_card(id).ok_or_else(|| EngineError::UnknownCard(id.clone()))?;
        deck.extend(std::iter::repeat_n(card, count as usize));
    }
    Ok(deck)
}

pub(crate) fn initial_counts(
    bounds: &BTreeMap<String, Bounds>,
    deck_size: u8,
    rng: &mut Rng,
) -> Result<BTreeMap<String, u8>> {
    validate_bounds(bounds, deck_size)?;
    let min_total: u16 = bounds.values().map(|bound| u16::from(bound.min)).sum();
    let mut counts = bounds
        .iter()
        .map(|(id, bound)| (id.clone(), bound.min))
        .collect::<BTreeMap<_, _>>();
    let ids = bounds.keys().cloned().collect::<Vec<_>>();
    let mut remaining = u16::from(deck_size) - min_total;
    while remaining > 0 {
        let expandable = ids
            .iter()
            .filter(|id| counts[*id] < bounds[*id].max)
            .collect::<Vec<_>>();
        let id = expandable[rng.index(expandable.len())];
        let Some(count) = counts.get_mut(id) else {
            return Err(EngineError::invalid(format!(
                "internal: random deck missing bound card {id}"
            )));
        };
        *count += 1;
        remaining -= 1;
    }
    Ok(counts)
}
