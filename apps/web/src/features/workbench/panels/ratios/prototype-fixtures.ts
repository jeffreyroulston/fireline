import { CARDS, type CardId, type CardStat, type DeckCounts } from "@/lib/engine";
import type { RatioRefineCriteria, RatioResult } from "../../types";
import { syntheticDamagesForMean } from "../pooled-damage";

/** Hands per list in the fixture. Matches a typical ratio-lab sample size. */
export const PROTOTYPE_SAMPLES = 64;

export const PROTOTYPE_BASE_COUNTS: DeckCounts = {
  arthur: 1,
  kingdom_informant: 3,
  clumsy_apprentice: 3,
  sable_remnant: 2,
  hasty_messenger: 2,
  red_hare: 1,
  ignited_stab: 3,
  rending_flames: 3,
  blazing_throw: 3,
  corhazi_courier: 2,
  dazzling_courtesan: 2,
  march_hare: 2,
  peppered_chef: 3,
  rococo: 2,
  vermilion_decree: 3,
  xiao_qiao: 2,
  hot_cake: 3,
  manic_zealot: 3,
  surging_bolt: 2,
  increasing_danger: 3,
  undeniable_truth: 2,
  smoke_out: 2,
  spark_alight: 2,
  package_courier: 2,
  flagrant_guide: 2,
};

export const PROTOTYPE_CRITERIA: RatioRefineCriteria = {
  baseDeckName: "Mock FiZa midrange",
  baseCounts: PROTOTYPE_BASE_COUNTS,
  cutBudgets: {
    clumsy_apprentice: 2,
    hot_cake: 2,
    kingdom_informant: 1,
  },
  replacements: {
    rending_flames: 4,
    vermilion_decree: 4,
    increasing_danger: 4,
    manic_zealot: 4,
    spark_alight: 3,
  },
};

function withCounts(
  patch: Partial<Record<CardId, number>>,
): DeckCounts {
  return { ...PROTOTYPE_BASE_COUNTS, ...patch };
}

function stat(
  card: CardId,
  copies: number,
  rates: {
    openRate: number;
    seeRate: number;
    playRate: number;
    playWhenInHand: number;
    damageWhenSeen: number;
    damageShare: number;
  },
): CardStat {
  const samples = PROTOTYPE_SAMPLES;
  const seen = Math.round(rates.seeRate * samples);
  const opened = Math.round(rates.openRate * samples);
  const plays = Math.round(rates.playRate * samples);
  return {
    card,
    name: CARDS[card]?.name ?? card,
    copies,
    opened,
    openedCopies: opened * Math.min(copies, 2),
    drawn: Math.max(0, seen - opened),
    seen,
    plays,
    attacks: Math.round(plays * 0.45),
    damage: Math.round(rates.damageWhenSeen * seen),
    openRate: rates.openRate,
    seeRate: rates.seeRate,
    playRate: rates.playRate,
    playWhenInHand: rates.playWhenInHand,
    damageWhenSeen: rates.damageWhenSeen,
    damageWhenSeenSum: Math.round(rates.damageWhenSeen * seen),
    damagePerPlay: plays > 0 ? rates.damageWhenSeen * seen / plays : 0,
    damageShare: rates.damageShare,
    withHandSamples: opened,
    withoutHandSamples: samples - opened,
    withHandDamageSum: Math.round(rates.damageWhenSeen * opened * 1.12),
    withoutHandDamageSum: Math.round(rates.damageWhenSeen * (samples - opened) * 0.88),
  };
}

const rankingStats: CardStat[] = [
  stat("arthur", 1, {
    openRate: 0.12,
    seeRate: 0.38,
    playRate: 0.31,
    playWhenInHand: 0.82,
    damageWhenSeen: 9.4,
    damageShare: 0.18,
  }),
  stat("increasing_danger", 3, {
    openRate: 0.31,
    seeRate: 0.72,
    playRate: 0.64,
    playWhenInHand: 0.91,
    damageWhenSeen: 7.1,
    damageShare: 0.22,
  }),
  stat("vermilion_decree", 3, {
    openRate: 0.28,
    seeRate: 0.66,
    playRate: 0.41,
    playWhenInHand: 0.62,
    damageWhenSeen: 6.4,
    damageShare: 0.14,
  }),
  stat("rending_flames", 4, {
    openRate: 0.34,
    seeRate: 0.78,
    playRate: 0.55,
    playWhenInHand: 0.7,
    damageWhenSeen: 5.8,
    damageShare: 0.16,
  }),
  stat("manic_zealot", 3, {
    openRate: 0.29,
    seeRate: 0.61,
    playRate: 0.48,
    playWhenInHand: 0.79,
    damageWhenSeen: 4.9,
    damageShare: 0.11,
  }),
  stat("clumsy_apprentice", 2, {
    openRate: 0.22,
    seeRate: 0.54,
    playRate: 0.19,
    playWhenInHand: 0.35,
    damageWhenSeen: 2.1,
    damageShare: 0.04,
  }),
];

export const PROTOTYPE_RANKING: RatioResult = {
  strategy: "randomSample",
  bestScore: 14.82,
  bestCounts: withCounts({
    clumsy_apprentice: 1,
    rending_flames: 4,
    increasing_danger: 4,
  }),
  history: [
    { iteration: 1, score: 13.1 },
    { iteration: 4, score: 13.64 },
    { iteration: 9, score: 14.21 },
    { iteration: 16, score: 14.82 },
  ],
  top: [
    {
      rank: 1,
      score: 14.82,
      counts: withCounts({
        clumsy_apprentice: 1,
        rending_flames: 4,
        increasing_danger: 4,
      }),
      cardStats: rankingStats,
      damages: syntheticDamagesForMean(14.82, PROTOTYPE_SAMPLES),
    },
    {
      rank: 2,
      score: 14.41,
      counts: withCounts({
        kingdom_informant: 2,
        vermilion_decree: 4,
      }),
      cardStats: rankingStats,
      damages: syntheticDamagesForMean(14.41, PROTOTYPE_SAMPLES),
    },
    {
      rank: 3,
      score: 14.08,
      counts: withCounts({
        hot_cake: 1,
        manic_zealot: 4,
        increasing_danger: 4,
      }),
      cardStats: rankingStats,
      damages: syntheticDamagesForMean(14.08, PROTOTYPE_SAMPLES),
    },
    {
      rank: 4,
      score: 13.64,
      counts: PROTOTYPE_BASE_COUNTS,
      cardStats: rankingStats,
      damages: syntheticDamagesForMean(13.64, PROTOTYPE_SAMPLES),
    },
    {
      rank: 5,
      score: 13.19,
      counts: withCounts({
        spark_alight: 3,
        smoke_out: 1,
        clumsy_apprentice: 2,
      }),
      cardStats: rankingStats,
      damages: syntheticDamagesForMean(13.19, PROTOTYPE_SAMPLES),
    },
  ],
};

function swapRow(
  rank: number,
  score: number,
  scoreDelta: number | null,
  candidate: CardId | null,
  counts: DeckCounts,
  play: { playRate: number; openRate: number; seeRate: number },
): NonNullable<RatioResult["top"]>[number] {
  const cardStats = candidate
    ? [
        stat(candidate, counts[candidate] ?? 1, {
          ...play,
          playWhenInHand: Math.min(1, play.playRate / Math.max(play.openRate, 0.08) * 0.9),
          damageWhenSeen: 5.2 + (scoreDelta ?? 0) * 0.8,
          damageShare: 0.09 + play.playRate * 0.12,
        }),
        ...rankingStats.filter((row) => row.card !== candidate),
      ]
    : rankingStats;
  return {
    rank,
    score,
    scoreDelta,
    candidate,
    counts,
    cardStats,
    damages: syntheticDamagesForMean(score, PROTOTYPE_SAMPLES),
  };
}

export const PROTOTYPE_SWAP_SWEEP: RatioResult = {
  strategy: "swapSweep",
  bestScore: 14.55,
  bestCounts: withCounts({
    clumsy_apprentice: 2,
    spark_alight: 3,
  }),
  history: [
    { iteration: 1, score: 13.64 },
    { iteration: 3, score: 14.12 },
    { iteration: 5, score: 14.55 },
  ],
  top: [
    swapRow(0, 13.64, null, null, PROTOTYPE_BASE_COUNTS, {
      playRate: 0,
      openRate: 0,
      seeRate: 0,
    }),
    swapRow(
      1,
      14.55,
      0.91,
      "spark_alight",
      withCounts({ clumsy_apprentice: 2, spark_alight: 3 }),
      { playRate: 0.58, openRate: 0.33, seeRate: 0.71 },
    ),
    swapRow(
      2,
      14.12,
      0.48,
      "package_courier",
      withCounts({ clumsy_apprentice: 2, package_courier: 3 }),
      { playRate: 0.44, openRate: 0.3, seeRate: 0.64 },
    ),
    swapRow(
      3,
      13.91,
      0.27,
      "blazing_throw",
      withCounts({ clumsy_apprentice: 2, blazing_throw: 4 }),
      { playRate: 0.51, openRate: 0.36, seeRate: 0.74 },
    ),
    swapRow(
      4,
      13.4,
      -0.24,
      "sable_remnant",
      withCounts({ clumsy_apprentice: 2, sable_remnant: 3 }),
      { playRate: 0.29, openRate: 0.27, seeRate: 0.58 },
    ),
    swapRow(
      5,
      12.88,
      -0.76,
      "corhazi_courier",
      withCounts({ clumsy_apprentice: 2, corhazi_courier: 3 }),
      { playRate: 0.22, openRate: 0.24, seeRate: 0.49 },
    ),
  ],
};
