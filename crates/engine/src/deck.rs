use crate::{
    cards::{CARD_COUNT, Card},
    model::{
        DamageDistribution, EffectiveRequest, SimType, SolveRequest, Step, TwoPassResult,
    },
    solver::solve,
    version::ENGINE_VERSION,
};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};

#[cfg(feature = "ts")]
use ts_rs::TS;

use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::time::Instant;

use rayon::prelude::*;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct DeckEvalRequest {
    pub deck: BTreeMap<String, u8>,
    #[serde(default = "default_samples")]
    pub samples: u16,
    #[serde(default = "default_true")]
    pub go_first: bool,
    #[serde(default = "default_turns")]
    pub max_turns: u8,
    #[serde(default = "default_seed")]
    pub seed: u64,
    #[serde(default)]
    pub sim_type: crate::model::SimType,
    #[serde(default = "default_rollouts")]
    pub rollouts: u16,
    #[serde(default)]
    pub budget: crate::budget::Budget,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct SampleHand {
    pub hand: Vec<&'static str>,
    pub damage: u8,
    pub steps: Vec<Step>,
    pub nodes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distribution: Option<DamageDistribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_pass: Option<TwoPassResult>,
    #[serde(skip)]
    #[cfg_attr(feature = "ts", ts(skip))]
    pub line_stats: crate::stats::LineCardStats,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct DeckEvalResult {
    pub sim_type: SimType,
    pub samples: usize,
    pub damages: Vec<u8>,
    pub hands: Vec<SampleHand>,
    pub mean: f64,
    pub p50: u8,
    pub p90: u8,
    pub max: u8,
    pub min: u8,
    pub unique_hands: usize,
    pub states_searched: u64,
    pub elapsed_ms: f64,
    pub effective: EffectiveRequest,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct OptimizeRequest {
    pub bounds: BTreeMap<String, crate::model::Bounds>,
    pub deck_size: u8,
    #[serde(default = "default_ratio_samples")]
    pub samples: u16,
    /// How many unique legal lists to score.
    #[serde(default = "default_decks", alias = "iterations")]
    pub decks: u32,
    #[serde(default)]
    pub metric: Metric,
    #[serde(default = "default_seed")]
    pub seed: u64,
    #[serde(default)]
    pub budget: crate::budget::Budget,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum Metric {
    #[default]
    Mean,
    P50,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct HistoryPoint {
    pub iteration: u16,
    pub score: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct RankedDeck {
    pub rank: u8,
    pub score: f64,
    pub counts: BTreeMap<String, u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct OptimizeProgress {
    pub decks_scored: u32,
    pub total_decks: u32,
    pub legal_decks: u64,
    pub hands_simulated: u64,
    pub total_hands: u64,
    pub best_score: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct OptimizeResult {
    pub best_counts: BTreeMap<String, u8>,
    pub best_score: f64,
    pub top: Vec<RankedDeck>,
    pub history: Vec<HistoryPoint>,
    pub legal_decks: u64,
    pub decks_scored: u32,
    pub elapsed_ms: f64,
    pub effective: EffectiveRequest,
}

const fn default_samples() -> u16 {
    8
}
const fn default_ratio_samples() -> u16 {
    4
}
const fn default_decks() -> u32 {
    32
}
const fn default_seed() -> u64 {
    42
}
const fn default_true() -> bool {
    true
}
const fn default_turns() -> u8 {
    3
}
const fn default_rollouts() -> u16 {
    8
}

/// Legacy alias kept for documentation; use `Budget::default().max_optimize_decks`.
const _MAX_OPTIMIZE_DECKS: u32 = 500;

#[derive(Clone)]
struct SampleDraw {
    drawn: Vec<Card>,
    key: [u8; CARD_COUNT],
    sample_index: u16,
}

fn hand_key(drawn: &[Card]) -> [u8; CARD_COUNT] {
    let mut key = [0_u8; CARD_COUNT];
    for &card in drawn {
        key[card.index()] += 1;
    }
    key
}

fn drawn_from_key(key: [u8; CARD_COUNT]) -> Vec<Card> {
    let mut drawn = Vec::new();
    for card in crate::cards::ALL_CARDS {
        drawn.extend(std::iter::repeat_n(card, key[card.index()] as usize));
    }
    drawn
}

fn solve_sample_hand(
    drawn: &[Card],
    request: &DeckEvalRequest,
    budget: &crate::budget::Budget,
    max_turns: u8,
    rollouts: u16,
    sample_index: u16,
) -> SampleHand {
    let hand_ids = drawn.iter().map(|card| card.id().to_string()).collect();
    let result = solve(&SolveRequest {
        hand: hand_ids,
        go_first: request.go_first,
        max_turns,
        sim_type: request.sim_type,
        deck: request.deck.clone(),
        rollouts,
        seed: request.seed.wrapping_add(u64::from(sample_index) * 17),
        budget: *budget,
    })
    .expect("deck cards already validated");
    let damage = match request.sim_type {
        SimType::MonteCarlo => result
            .distribution
            .as_ref()
            .map(|dist| dist.p50)
            .unwrap_or(result.max_damage),
        _ => result.max_damage,
    };
    SampleHand {
        hand: drawn.iter().map(|card| card.id()).collect(),
        damage,
        steps: result.steps,
        nodes: result.nodes,
        distribution: result.distribution,
        two_pass: result.two_pass,
        line_stats: result.line_stats,
    }
}

fn solve_unique_hands(
    unique: &[(SimType, [u8; CARD_COUNT], u16)],
    request: &DeckEvalRequest,
    budget: &crate::budget::Budget,
    max_turns: u8,
    rollouts: u16,
) -> FxHashMap<(SimType, [u8; CARD_COUNT]), SampleHand> {
    unique
        .par_iter()
        .map(|&(sim_type, key, sample_index)| {
            let drawn = drawn_from_key(key);
            let mut sample = solve_sample_hand(
                &drawn,
                request,
                budget,
                max_turns,
                rollouts,
                sample_index,
            );
            sample.hand = drawn.iter().map(|card| card.id()).collect();
            ((sim_type, key), sample)
        })
        .collect()
}

#[derive(Clone, Copy)]
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^ (z >> 31)
    }

    fn index(&mut self, len: usize) -> usize {
        (self.next() as usize) % len
    }
}

pub fn evaluate(request: &DeckEvalRequest) -> Result<DeckEvalResult, String> {
    evaluate_with_progress(request, |_, _| ControlFlow::Continue(()))
}

pub fn evaluate_with_progress(
    request: &DeckEvalRequest,
    mut on_hand: impl FnMut(u16, u16) -> ControlFlow<()>,
) -> Result<DeckEvalResult, String> {
    let started = Instant::now();
    let budget = request.budget;
    let deck = parse_counts(&request.deck)?;
    if deck.len() < 7 {
        return Err("deck must contain at least seven recognized cards".into());
    }
    let max_turns = request
        .max_turns
        .clamp(budget.max_turns_min, budget.max_turns_max);
    let rollouts = request.rollouts.clamp(1, budget.max_eval_rollouts);
    let mut rng = Rng(request.seed);

    let mut draws = Vec::with_capacity(request.samples as usize);
    for sample_index in 0..request.samples {
        let mut shuffled = deck.clone();
        shuffle(&mut shuffled, &mut rng);
        let drawn = shuffled[..7].to_vec();
        draws.push(SampleDraw {
            key: hand_key(&drawn),
            drawn,
            sample_index,
        });
    }

    let mut unique = Vec::new();
    let mut seen = FxHashMap::default();
    for draw in &draws {
        let cache_key = (request.sim_type, draw.key);
        if seen.insert(cache_key, draw.sample_index).is_none() {
            unique.push((request.sim_type, draw.key, draw.sample_index));
        }
    }

    let cache = solve_unique_hands(&unique, request, &budget, max_turns, rollouts);

    let mut hands = Vec::with_capacity(draws.len());
    let mut damages = Vec::with_capacity(draws.len());
    let mut total_nodes = 0;
    let mut stats_acc = crate::stats::DeckStatAccumulator::with_deck(&deck);

    for (index, draw) in draws.iter().enumerate() {
        let cache_key = (request.sim_type, draw.key);
        let mut sample = cache
            .get(&cache_key)
            .cloned()
            .expect("every draw key was solved");
        sample.hand = draw.drawn.iter().map(|card| card.id()).collect();
        total_nodes += sample.nodes;
        damages.push(sample.damage);
        stats_acc.add_sample(&draw.drawn, &sample.line_stats);
        hands.push(sample);
        if on_hand(index as u16 + 1, request.samples).is_break() {
            break;
        }
    }

    let mut sorted = damages.clone();
    sorted.sort_unstable();
    let mean =
        damages.iter().map(|&value| f64::from(value)).sum::<f64>() / damages.len().max(1) as f64;
    Ok(DeckEvalResult {
        sim_type: request.sim_type,
        samples: damages.len(),
        damages,
        hands,
        mean,
        p50: percentile(&sorted, 50),
        p90: percentile(&sorted, 90),
        max: sorted.last().copied().unwrap_or(0),
        min: sorted.first().copied().unwrap_or(0),
        unique_hands: cache.len(),
        states_searched: total_nodes,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: EffectiveRequest {
            engine_version: ENGINE_VERSION,
            root_seed: request.seed,
            sim_type: Some(request.sim_type),
            deck: request.deck.clone(),
            go_first: Some(request.go_first),
            max_turns: Some(max_turns),
            rollouts: Some(rollouts),
            samples: Some(request.samples),
            metric: None,
            bounds: BTreeMap::new(),
            deck_size: None,
            decks: None,
            budget,
        },
        card_stats: stats_acc.finish(),
    })
}

pub fn optimize(request: &OptimizeRequest) -> Result<OptimizeResult, String> {
    optimize_with_progress(request, |_| ControlFlow::Continue(()))
}

/// Number of legal count vectors inside `bounds` that sum to `deck_size`.
pub fn count_legal_decks(
    bounds: &BTreeMap<String, Bounds>,
    deck_size: u8,
) -> Result<u64, String> {
    validate_bounds(bounds, deck_size)?;
    let ranges = bounds
        .values()
        .map(|bound| (bound.min, bound.max))
        .collect::<Vec<_>>();
    Ok(count_compositions(&ranges, deck_size))
}

pub fn optimize_with_progress(
    request: &OptimizeRequest,
    mut on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()>,
) -> Result<OptimizeResult, String> {
    let started = Instant::now();
    let budget = request.budget;
    let legal_decks = count_legal_decks(&request.bounds, request.deck_size)?;
    if legal_decks == 0 {
        return Err("no legal lists exist for these bounds and deck size".into());
    }

    let target = (request.decks.max(1))
        .min(budget.max_optimize_decks)
        .min(u32::try_from(legal_decks).unwrap_or(u32::MAX));
    let total_hands = u64::from(target) * u64::from(request.samples);
    let mut decks_scored = 0_u32;
    let mut best_score = 0.0_f64;
    let mut best = BTreeMap::new();
    let mut top: Vec<(f64, BTreeMap<String, u8>)> = Vec::with_capacity(5);
    let mut history = Vec::new();

    if on_progress(OptimizeProgress {
        decks_scored: 0,
        total_decks: target,
        legal_decks,
        hands_simulated: 0,
        total_hands,
        best_score: 0.0,
    })
    .is_break()
    {
        return Err("cancelled".into());
    }

    let mut rng = Rng(request.seed);
    let mut seen = rustc_hash::FxHashSet::default();
    let mut attempts = 0_u64;
    let max_draw_attempts = u64::from(target).saturating_mul(64).max(64);

    while decks_scored < target && attempts < max_draw_attempts {
        attempts += 1;
        let counts = initial_counts(&request.bounds, request.deck_size, &mut rng)?;
        let key = counts_key(&counts);
        if !seen.insert(key) {
            if seen.len() as u64 >= legal_decks {
                break;
            }
            continue;
        }

        let score = score_optimize_deck(
            &counts,
            request,
            &mut decks_scored,
            target,
            legal_decks,
            total_hands,
            best_score,
            &mut on_progress,
        )?;
        consider_top(&mut top, score, &counts);
        if decks_scored == 1 || score > best_score {
            best_score = score;
            best = counts;
        }
        history.push(HistoryPoint {
            iteration: decks_scored as u16,
            score: best_score,
        });
    }

    if decks_scored == 0 {
        return Err("could not sample any legal lists".into());
    }

    let _ = on_progress(OptimizeProgress {
        decks_scored,
        total_decks: target,
        legal_decks,
        hands_simulated: u64::from(decks_scored) * u64::from(request.samples),
        total_hands,
        best_score,
    });

    Ok(OptimizeResult {
        best_counts: best,
        best_score,
        top: ranked_decks(&top),
        history,
        legal_decks,
        decks_scored,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: EffectiveRequest {
            engine_version: ENGINE_VERSION,
            root_seed: request.seed,
            sim_type: Some(SimType::FireBrick),
            deck: BTreeMap::new(),
            go_first: Some(true),
            max_turns: Some(3),
            rollouts: Some(1),
            samples: Some(request.samples),
            metric: Some(match request.metric {
                Metric::Mean => "mean",
                Metric::P50 => "p50",
            }),
            bounds: request.bounds.clone(),
            deck_size: Some(request.deck_size),
            decks: Some(target),
            budget,
        },
    })
}

fn counts_key(counts: &BTreeMap<String, u8>) -> Vec<u8> {
    counts.values().copied().collect()
}

fn validate_bounds(bounds: &BTreeMap<String, Bounds>, deck_size: u8) -> Result<(), String> {
    if bounds.is_empty() {
        return Err("bounds must include at least one card".into());
    }
    for id in bounds.keys() {
        crate::cards::parse_card(id).ok_or_else(|| format!("unknown card: {id}"))?;
    }
    let min_total: u16 = bounds.values().map(|bound| u16::from(bound.min)).sum();
    let max_total: u16 = bounds.values().map(|bound| u16::from(bound.max)).sum();
    if u16::from(deck_size) < min_total || u16::from(deck_size) > max_total {
        return Err(format!(
            "deck size must be between bound totals {min_total} and {max_total}"
        ));
    }
    for bound in bounds.values() {
        if bound.min > bound.max {
            return Err("each card minimum must be <= maximum".into());
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
        for sum in 0..=size {
            let right = sum as isize - isize::from(lo);
            let left = sum as isize - isize::from(hi);
            if right < 0 {
                continue;
            }
            let left = left.max(0) as usize;
            let right = (right as usize).min(size);
            if left <= right {
                let total = prefix[right + 1] - prefix[left];
                next[sum] = u64::try_from(total).unwrap_or(u64::MAX);
            }
        }
        dp = next;
    }
    dp[size]
}

fn consider_top(top: &mut Vec<(f64, BTreeMap<String, u8>)>, score: f64, counts: &BTreeMap<String, u8>) {
    if let Some(existing) = top.iter_mut().find(|(_, known)| known == counts) {
        if score > existing.0 {
            existing.0 = score;
            top.sort_by(|left, right| {
                right
                    .0
                    .partial_cmp(&left.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        return;
    }
    if top.len() < 5 || top.last().is_some_and(|(worst, _)| score > *worst) {
        top.push((score, counts.clone()));
        top.sort_by(|left, right| {
            right
                .0
                .partial_cmp(&left.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        top.truncate(5);
    }
}

fn ranked_decks(top: &[(f64, BTreeMap<String, u8>)]) -> Vec<RankedDeck> {
    top.iter()
        .enumerate()
        .map(|(index, (score, counts))| RankedDeck {
            rank: (index + 1) as u8,
            score: *score,
            counts: counts.clone(),
        })
        .collect()
}

fn score_optimize_deck(
    counts: &BTreeMap<String, u8>,
    request: &OptimizeRequest,
    decks_scored: &mut u32,
    total_decks: u32,
    legal_decks: u64,
    total_hands: u64,
    best_score: f64,
    on_progress: &mut impl FnMut(OptimizeProgress) -> ControlFlow<()>,
) -> Result<f64, String> {
    *decks_scored += 1;
    let deck_number = *decks_scored;
    let samples = request.samples;
    let result = evaluate_with_progress(
        &DeckEvalRequest {
            deck: counts.clone(),
            samples,
            go_first: true,
            max_turns: 3,
            seed: request.seed.wrapping_add(u64::from(deck_number) * 131),
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: request.budget,
        },
        |hand_done, _hand_total| {
            let hands_simulated = u64::from(deck_number.saturating_sub(1)) * u64::from(samples)
                + u64::from(hand_done);
            on_progress(OptimizeProgress {
                decks_scored: deck_number,
                total_decks,
                legal_decks,
                hands_simulated,
                total_hands,
                best_score,
            })
        },
    )?;
    Ok(match request.metric {
        Metric::Mean => result.mean,
        Metric::P50 => f64::from(result.p50),
    })
}

fn parse_counts(counts: &BTreeMap<String, u8>) -> Result<Vec<Card>, String> {
    let mut deck = Vec::new();
    for (id, &count) in counts {
        let card = crate::cards::parse_card(id).ok_or_else(|| format!("unknown card: {id}"))?;
        deck.extend(std::iter::repeat_n(card, count as usize));
    }
    Ok(deck)
}

fn initial_counts(
    bounds: &BTreeMap<String, Bounds>,
    deck_size: u8,
    rng: &mut Rng,
) -> Result<BTreeMap<String, u8>, String> {
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
        *counts.get_mut(id).expect("bound id exists") += 1;
        remaining -= 1;
    }
    Ok(counts)
}

pub use crate::model::Bounds;

fn shuffle(values: &mut [Card], rng: &mut Rng) {
    for index in (1..values.len()).rev() {
        values.swap(index, rng.index(index + 1));
    }
}

fn percentile(sorted: &[u8], percentile: usize) -> u8 {
    if sorted.is_empty() {
        return 0;
    }
    let index = ((percentile * sorted.len()) / 100).min(sorted.len() - 1);
    sorted[index]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deck_evaluation_is_deterministic() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
        ]);
        let request = DeckEvalRequest {
            deck,
            samples: 2,
            go_first: true,
            max_turns: 2,
            seed: 9,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
        };
        let one = evaluate(&request).unwrap();
        let two = evaluate(&request).unwrap();
        assert_eq!(one.damages, two.damages);
        assert_eq!(one.effective.root_seed, 9);
        assert_eq!(one.effective.max_turns, Some(2));
        assert_eq!(one.effective.rollouts, Some(1));
        assert_eq!(one.effective.samples, Some(2));
        assert_eq!(one.effective.engine_version, two.effective.engine_version);
    }

    #[test]
    fn optimizer_preserves_deck_size() {
        let result = optimize(&OptimizeRequest {
            bounds: BTreeMap::from([
                ("arthur".into(), Bounds { min: 1, max: 3 }),
                ("kingdom_informant".into(), Bounds { min: 1, max: 3 }),
                ("clumsy_apprentice".into(), Bounds { min: 1, max: 3 }),
            ]),
            deck_size: 7,
            samples: 1,
            decks: 4,
            metric: Metric::Mean,
            seed: 4,
            budget: crate::budget::Budget::default(),
        })
        .unwrap();
        assert_eq!(
            result
                .best_counts
                .values()
                .map(|&count| u16::from(count))
                .sum::<u16>(),
            7
        );
        assert!(result.decks_scored >= 1);
        assert!(result.legal_decks >= result.decks_scored as u64);
        assert_eq!(result.effective.decks, Some(4));
        assert_eq!(result.effective.deck_size, Some(7));
        assert_eq!(result.effective.samples, Some(1));
        assert_eq!(result.effective.metric, Some("mean"));
    }

    #[test]
    fn evaluate_clamps_turns_and_rollouts() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
        ]);
        let result = evaluate(&DeckEvalRequest {
            deck,
            samples: 1,
            go_first: true,
            max_turns: 1,
            seed: 3,
            sim_type: SimType::FireBrick,
            rollouts: 0,
            budget: crate::budget::Budget::default(),
        })
        .unwrap();
        assert_eq!(result.effective.max_turns, Some(2));
        assert_eq!(result.effective.rollouts, Some(1));
    }

    #[test]
    fn card_stats_expose_damage_when_seen_sum() {
        let deck = BTreeMap::from([
            ("arthur".into(), 3),
            ("kingdom_informant".into(), 3),
            ("clumsy_apprentice".into(), 3),
        ]);
        let result = evaluate(&DeckEvalRequest {
            deck,
            samples: 4,
            go_first: true,
            max_turns: 2,
            seed: 11,
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: crate::budget::Budget::default(),
        })
        .unwrap();
        for stat in &result.card_stats {
            if stat.seen > 0 {
                assert_eq!(
                    stat.damage_when_seen,
                    f64::from(stat.damage_when_seen_sum) / f64::from(stat.seen)
                );
            } else {
                assert_eq!(stat.damage_when_seen_sum, 0);
            }
        }
    }
}
