//! Deck evaluation and optimization request/result types.

use crate::line_event::LineEvent;
use crate::model::{DamageDistribution, EffectiveRequest, SimType, TwoPassResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[cfg(feature = "ts")]
use ts_rs::TS;

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
    #[serde(default)]
    pub materials: BTreeMap<String, u8>,
    #[serde(default)]
    pub max_threads: Option<u16>,
    #[serde(default)]
    pub glimpse_enabled: Option<bool>,
    #[serde(default)]
    pub max_hand_duration_secs: Option<u16>,
    #[serde(default)]
    pub max_card_draw: Option<u16>,
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
    /// Final hand + memory on the chosen max-damage line.
    pub end_influence: u8,
    pub events: Vec<LineEvent>,
    pub nodes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distribution: Option<DamageDistribution>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub two_pass: Option<TwoPassResult>,
    /// Sparse per-card line counters for the chosen path (persist → run_sample_card_stats).
    #[serde(skip_serializing_if = "crate::stats::SparseLineStats::is_empty_stats")]
    pub line_card_stats: crate::stats::SparseLineStats,
    #[serde(skip)]
    #[cfg_attr(feature = "ts", ts(skip))]
    pub line_stats: crate::stats::LineCardStats,
    #[serde(skip)]
    #[cfg_attr(feature = "ts", ts(skip))]
    pub brick_line_stats: Option<crate::stats::LineCardStats>,
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
    pub p10: u8,
    pub p50: u8,
    pub p90: u8,
    pub max: u8,
    pub min: u8,
    /// Mean final hand + memory across sampled max-damage lines.
    pub mean_end_influence: f64,
    pub unique_hands: usize,
    pub states_searched: u64,
    pub elapsed_ms: f64,
    pub effective: EffectiveRequest,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub brick_card_stats: Vec<crate::stats::CardStat>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub oracle_card_stats: Vec<crate::stats::CardStat>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub timed_out_samples: usize,
}

const fn is_zero(value: &usize) -> bool {
    *value == 0
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
    #[serde(default)]
    pub materials: BTreeMap<String, u8>,
    #[serde(default)]
    pub strategy: Strategy,
    #[serde(default)]
    pub base_deck: BTreeMap<String, u8>,
    #[serde(default)]
    pub swap: Option<SwapConfig>,
    #[serde(default)]
    pub multi_deck: Option<MultiDeckConfig>,
    #[serde(default = "default_true")]
    pub go_first: bool,
    #[serde(default = "default_turns")]
    pub max_turns: u8,
    #[serde(default)]
    pub sim_type: crate::model::SimType,
    #[serde(default = "default_rollouts")]
    pub rollouts: u16,
    #[serde(default)]
    pub max_threads: Option<u16>,
    #[serde(default)]
    pub glimpse_enabled: Option<bool>,
    #[serde(default)]
    pub max_hand_duration_secs: Option<u16>,
    #[serde(default)]
    pub max_card_draw: Option<u16>,
    #[serde(default)]
    pub eval_mode: EvalMode,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum EvalMode {
    #[default]
    Full,
    Sprt,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub enum Strategy {
    #[default]
    RandomSample,
    HillClimb,
    Genetic,
    SwapSweep,
    MultiDeck,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct SwapConfig {
    pub from: String,
    pub count: u8,
    pub candidates: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct MultiDeckConfig {
    pub decks: Vec<BTreeMap<String, u8>>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_delta: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub card_stats: Vec<crate::stats::CardStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalProgress {
    pub sample: u16,
    pub total: u16,
    pub rollout: u16,
    pub total_rollouts: u16,
}

/// Phase of a single opening-hand solve, for per-hand progress bars.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HandPhase {
    Started,
    /// Waiting for a memory-gate slot (thread cap, planned RAM budget, or park).
    Throttled,
    Rollout,
    Done,
    /// Hand exceeded the per-hand wall-clock limit and was excluded.
    TimedOut,
}

/// Progress for one concurrent opening hand (started / mid-rollout / done).
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandProgress {
    pub sample_index: u16,
    pub phase: HandPhase,
    pub rollout: u16,
    pub total_rollouts: u16,
    /// Optimize runs stamp the 1-based deck being scored so parallel lists
    /// do not collapse onto the same sample slot in the UI.
    #[serde(default, skip_serializing_if = "is_zero_u32")]
    pub deck_number: u32,
}

const fn is_zero_u32(value: &u32) -> bool {
    *value == 0
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
const _MAX_OPTIMIZE_DECKS: u32 = 5000;
