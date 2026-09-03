import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import {
  applyRunSettingsFilter,
  type RunSettingsFilter,
} from "./run-settings-filter.js";
import type { VersionTriple } from "./version.js";

const DONE_STATUSES = ["complete", "partial"] as const;

export const MIN_HAND_BUCKET_SAMPLES = 5;

export type WeightedDamage = { damage: number; weight: number };

export type EvaluateSample = {
  hand: Set<string>;
  damage: number;
  weight: number;
  deckCards: Set<string>;
  deckId: string | null;
};

export type CardHandImpact = {
  withHandMean: number | null;
  withoutHandMean: number | null;
  handLift: number | null;
  withHandSamples: number;
  withoutHandSamples: number;
};

export function deckCardSet(counts: Record<string, number>): Set<string> {
  const set = new Set<string>();
  for (const [cardId, copies] of Object.entries(counts)) {
    if (typeof copies === "number" && copies > 0) {
      set.add(cardId);
    }
  }
  return set;
}

export function weightedMean(entries: WeightedDamage[]): number | null {
  if (entries.length === 0) {
    return null;
  }
  let totalWeight = 0;
  let totalDamage = 0;
  for (const entry of entries) {
    totalWeight += entry.weight;
    totalDamage += entry.damage * entry.weight;
  }
  if (totalWeight <= 0) {
    return null;
  }
  return totalDamage / totalWeight;
}

export function weightedCount(entries: WeightedDamage[]): number {
  return entries.reduce((sum, entry) => sum + entry.weight, 0);
}

export function openingHandSet(cardIds: string[]): Set<string> {
  return new Set(cardIds);
}

export function finalizeHandImpact(
  withHand: WeightedDamage[],
  withoutHand: WeightedDamage[],
): CardHandImpact {
  const withHandSamples = weightedCount(withHand);
  const withoutHandSamples = weightedCount(withoutHand);
  let withHandMean: number | null = null;
  let withoutHandMean: number | null = null;
  let handLift: number | null = null;

  if (
    withHandSamples >= MIN_HAND_BUCKET_SAMPLES &&
    withoutHandSamples >= MIN_HAND_BUCKET_SAMPLES
  ) {
    withHandMean = weightedMean(withHand);
    withoutHandMean = weightedMean(withoutHand);
    if (withHandMean != null && withoutHandMean != null) {
      handLift = withHandMean - withoutHandMean;
    }
  }

  return {
    withHandMean,
    withoutHandMean,
    handLift,
    withHandSamples,
    withoutHandSamples,
  };
}

export function computeHandImpact(
  samples: EvaluateSample[],
  cardId: string,
  deckId?: string,
): CardHandImpact {
  const withHand: WeightedDamage[] = [];
  const withoutHand: WeightedDamage[] = [];

  for (const sample of samples) {
    if (deckId != null && sample.deckId !== deckId) {
      continue;
    }
    if (!sample.deckCards.has(cardId)) {
      continue;
    }
    const entry = { damage: sample.damage, weight: sample.weight };
    if (sample.hand.has(cardId)) {
      withHand.push(entry);
    } else {
      withoutHand.push(entry);
    }
  }

  return finalizeHandImpact(withHand, withoutHand);
}

export function computeAllHandImpacts(
  samples: EvaluateSample[],
): Map<string, CardHandImpact> {
  const withBuckets = new Map<string, WeightedDamage[]>();
  const withoutBuckets = new Map<string, WeightedDamage[]>();

  for (const sample of samples) {
    const entry = { damage: sample.damage, weight: sample.weight };
    for (const cardId of sample.deckCards) {
      if (sample.hand.has(cardId)) {
        const bucket = withBuckets.get(cardId) ?? [];
        bucket.push(entry);
        withBuckets.set(cardId, bucket);
      } else {
        const bucket = withoutBuckets.get(cardId) ?? [];
        bucket.push(entry);
        withoutBuckets.set(cardId, bucket);
      }
    }
  }

  const impacts = new Map<string, CardHandImpact>();
  const cardIds = new Set([...withBuckets.keys(), ...withoutBuckets.keys()]);
  for (const cardId of cardIds) {
    impacts.set(
      cardId,
      finalizeHandImpact(
        withBuckets.get(cardId) ?? [],
        withoutBuckets.get(cardId) ?? [],
      ),
    );
  }
  return impacts;
}

export async function loadEvaluateSamples(
  db: Kysely<Database>,
  options: {
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckHash?: string;
    deckIds?: string[];
    runSettings?: RunSettingsFilter;
  },
): Promise<EvaluateSample[]> {
  if (options.deckIds !== undefined && options.deckIds.length === 0) {
    return [];
  }

  let query = db
    .selectFrom("run_samples as rs")
    .innerJoin("runs as r", "r.id", "rs.run_id")
    .select([
      "rs.card_ids as cardIds",
      "rs.damage as damage",
      "rs.occurrence_count as occurrenceCount",
      "r.deck_counts as deckCounts",
      "r.deck_id as deckId",
    ])
    .where("r.status", "in", DONE_STATUSES)
    .where("r.kind", "=", "evaluate")
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.attribution_version", "=", options.attributionVersion);

  if (options.deckIds !== undefined) {
    query = query.where("r.deck_id", "in", options.deckIds);
  } else if (options.deckHash) {
    query = query.where("r.deck_hash", "=", options.deckHash);
  } else {
    query = query.where("r.deck_id", "is not", null);
  }

  query = applyRunSettingsFilter(query, options.runSettings, "r");

  const rows = await query.execute();
  return rows.map((row) => ({
    hand: openingHandSet(row.cardIds),
    damage: row.damage,
    weight: row.occurrenceCount,
    deckCards: deckCardSet(row.deckCounts ?? {}),
    deckId: row.deckId,
  }));
}

export function evaluateSamplesFromRows(
  rows: Array<{
    cardIds: string[];
    damage: number;
    occurrenceCount: number;
    deckCounts: Record<string, number>;
  }>,
): EvaluateSample[] {
  return rows.map((row) => ({
    hand: openingHandSet(row.cardIds),
    damage: row.damage,
    weight: row.occurrenceCount,
    deckCards: deckCardSet(row.deckCounts ?? {}),
    deckId: null,
  }));
}
