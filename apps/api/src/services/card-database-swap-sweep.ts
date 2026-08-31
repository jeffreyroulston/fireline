import { type Kysely } from "kysely";
import type { CardStat } from "@ga-fire/contracts";
import type { Database } from "../db/types.js";
import {
  type CardHandImpact,
  MIN_HAND_BUCKET_SAMPLES,
} from "../lib/hand-impact.js";
import type { VersionTriple } from "../lib/version.js";
import type {
  CardDatabaseContributor,
  CardDatabaseDeckRow,
  CardPerformance,
} from "./card-database.js";

const COMPLETE = "complete" as const;
const SWAP_SWEEP = "swapSweep" as const;
export const SWAP_SWEEP_VIRTUAL_DECK_PREFIX = "swap-sweep:";

export function swapSweepVirtualDeckId(deckId: string): string {
  return `${SWAP_SWEEP_VIRTUAL_DECK_PREFIX}${deckId}`;
}

export function swapSweepVirtualDeckName(name: string): string {
  return `${name} - Swap Sweep`;
}

export function parseSwapSweepVirtualDeckId(id: string): string | null {
  if (!id.startsWith(SWAP_SWEEP_VIRTUAL_DECK_PREFIX)) {
    return null;
  }
  const original = id.slice(SWAP_SWEEP_VIRTUAL_DECK_PREFIX.length);
  return original || null;
}

function sourceDeckIdsFromFilter(
  deckIds: string[] | undefined,
): string[] | undefined {
  if (deckIds === undefined) {
    return undefined;
  }
  return deckIds.map((id) => parseSwapSweepVirtualDeckId(id) ?? id);
}

type SwapSweepEvalRow = {
  runId: string;
  deckId: string;
  deckName: string;
  startedAt: Date;
  candidate: string | null;
  samples: number;
  cardStats: CardStat[] | null;
};

export type SwapSweepSlice = {
  contributors: CardDatabaseContributor[];
  performanceByCard: Map<string, CardPerformance>;
  totalRuns: number;
  totalSamples: number;
  olderCardIds: Set<string>;
};

export type SwapSweepQuery = {
  simType: string;
  version: VersionTriple;
  attributionVersion: number;
  currentVersion?: VersionTriple;
  currentAttributionVersion?: number;
  deckIds?: string[];
};

function statForCard(
  stats: CardStat[] | null | undefined,
  cardId: string,
): CardStat | null {
  if (!stats) return null;
  return stats.find((row) => row.card === cardId) ?? null;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type StoredHandBuckets = {
  withHandDamageSum: number;
  withHandSamples: number;
  withoutHandDamageSum: number;
  withoutHandSamples: number;
};

function handBucketsFromStat(stat: CardStat): StoredHandBuckets {
  const row = stat as CardStat & Partial<StoredHandBuckets>;
  return {
    withHandDamageSum: finiteNumber(row.withHandDamageSum),
    withHandSamples: finiteNumber(row.withHandSamples),
    withoutHandDamageSum: finiteNumber(row.withoutHandDamageSum),
    withoutHandSamples: finiteNumber(row.withoutHandSamples),
  };
}

function impactFromBuckets(buckets: StoredHandBuckets): CardHandImpact {
  const withHandSamples = buckets.withHandSamples;
  const withoutHandSamples = buckets.withoutHandSamples;
  let withHandMean: number | null = null;
  let withoutHandMean: number | null = null;
  let handLift: number | null = null;
  if (
    withHandSamples >= MIN_HAND_BUCKET_SAMPLES &&
    withoutHandSamples >= MIN_HAND_BUCKET_SAMPLES
  ) {
    withHandMean = buckets.withHandDamageSum / withHandSamples;
    withoutHandMean = buckets.withoutHandDamageSum / withoutHandSamples;
    handLift = withHandMean - withoutHandMean;
  }
  return {
    withHandMean,
    withoutHandMean,
    handLift,
    withHandSamples,
    withoutHandSamples,
  };
}

function emptyPerformance(): CardPerformance {
  return {
    runCount: 0,
    deckCount: 0,
    eligibleSamples: 0,
    opened: 0,
    openedCopies: 0,
    drawn: 0,
    seen: 0,
    plays: 0,
    attacks: 0,
    damage: 0,
    openRate: 0,
    seeRate: 0,
    playWhenInHand: 0,
    damageWhenSeen: 0,
    withHandMean: null,
    withoutHandMean: null,
    handLift: null,
    withHandSamples: 0,
    withoutHandSamples: 0,
  };
}

function performanceFromTotals(row: {
  runCount: number;
  deckCount: number;
  eligibleSamples: number;
  opened: number;
  openedCopies: number;
  drawn: number;
  seen: number;
  plays: number;
  attacks: number;
  damage: number;
  damageWhenSeenSum: number;
  handBuckets: StoredHandBuckets;
}): CardPerformance {
  const eligibleSamples = row.eligibleSamples;
  const handAppearances = row.openedCopies + row.drawn;
  const seen = row.seen;
  const impact = impactFromBuckets(row.handBuckets);
  return {
    runCount: row.runCount,
    deckCount: row.deckCount,
    eligibleSamples,
    opened: row.opened,
    openedCopies: row.openedCopies,
    drawn: row.drawn,
    seen,
    plays: row.plays,
    attacks: row.attacks,
    damage: row.damage,
    openRate: eligibleSamples > 0 ? row.opened / eligibleSamples : 0,
    seeRate: eligibleSamples > 0 ? row.seen / eligibleSamples : 0,
    playWhenInHand: handAppearances > 0 ? row.plays / handAppearances : 0,
    damageWhenSeen: seen > 0 ? row.damageWhenSeenSum / seen : 0,
    withHandMean: impact.withHandMean,
    withoutHandMean: impact.withoutHandMean,
    handLift: impact.handLift,
    withHandSamples: impact.withHandSamples,
    withoutHandSamples: impact.withoutHandSamples,
  };
}

async function loadSwapSweepEvalRows(
  db: Kysely<Database>,
  options: SwapSweepQuery & { otherVersions?: boolean },
): Promise<SwapSweepEvalRow[]> {
  const sourceDeckIds = sourceDeckIdsFromFilter(options.deckIds);
  if (sourceDeckIds !== undefined && sourceDeckIds.length === 0) {
    return [];
  }

  let query = db
    .selectFrom("run_candidates as c")
    .innerJoin("runs as r", "r.id", "c.run_id")
    .innerJoin("decks as d", "d.id", "r.deck_id")
    .select([
      "r.id as runId",
      "r.deck_id as deckId",
      "d.name as deckName",
      "r.started_at as startedAt",
      "c.candidate as candidate",
      "r.samples as samples",
      "c.card_stats as cardStats",
    ])
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "optimize")
    .where("r.optimize_strategy", "=", SWAP_SWEEP)
    .where("r.sim_type", "=", options.simType)
    .where("c.card_stats", "is not", null);

  if (options.otherVersions) {
    const current = options.currentVersion;
    const currentAttr = options.currentAttributionVersion;
    if (current == null || currentAttr == null) {
      return [];
    }
    query = query.where((eb) =>
      eb.or([
        eb("r.rules_version", "<>", current.rulesVersion),
        eb("r.sampler_version", "<>", current.samplerVersion),
        eb("r.attribution_version", "<>", currentAttr),
      ]),
    );
  } else {
    query = query
      .where("r.rules_version", "=", options.version.rulesVersion)
      .where("r.sampler_version", "=", options.version.samplerVersion)
      .where("r.attribution_version", "=", options.attributionVersion);
  }

  if (sourceDeckIds && sourceDeckIds.length > 0) {
    query = query.where("r.deck_id", "in", sourceDeckIds);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    runId: row.runId,
    deckId: row.deckId!,
    deckName: row.deckName,
    startedAt: row.startedAt,
    candidate: row.candidate,
    samples: row.samples ?? 0,
    cardStats: row.cardStats as CardStat[] | null,
  }));
}

function aggregateSwapPerformance(
  rows: SwapSweepEvalRow[],
  cardId: string,
): CardPerformance {
  const matching = rows.filter((row) => statForCard(row.cardStats, cardId));
  if (matching.length === 0) {
    return emptyPerformance();
  }

  let opened = 0;
  let openedCopies = 0;
  let drawn = 0;
  let seen = 0;
  let plays = 0;
  let attacks = 0;
  let damage = 0;
  let damageWhenSeenSum = 0;
  let eligibleSamples = 0;
  const handBuckets: StoredHandBuckets = {
    withHandDamageSum: 0,
    withHandSamples: 0,
    withoutHandDamageSum: 0,
    withoutHandSamples: 0,
  };
  const deckIds = new Set<string>();
  const runIds = new Set<string>();

  for (const row of matching) {
    deckIds.add(row.deckId);
    runIds.add(row.runId);
    eligibleSamples += row.samples;
    const stat = statForCard(row.cardStats, cardId)!;
    opened += stat.opened;
    openedCopies += stat.openedCopies;
    drawn += stat.drawn;
    seen += stat.seen;
    plays += stat.plays;
    attacks += stat.attacks;
    damage += stat.damage;
    damageWhenSeenSum += stat.damageWhenSeenSum;
    const buckets = handBucketsFromStat(stat);
    handBuckets.withHandDamageSum += buckets.withHandDamageSum;
    handBuckets.withHandSamples += buckets.withHandSamples;
    handBuckets.withoutHandDamageSum += buckets.withoutHandDamageSum;
    handBuckets.withoutHandSamples += buckets.withoutHandSamples;
  }

  return performanceFromTotals({
    runCount: runIds.size,
    deckCount: deckIds.size,
    eligibleSamples,
    opened,
    openedCopies,
    drawn,
    seen,
    plays,
    attacks,
    damage,
    damageWhenSeenSum,
    handBuckets,
  });
}

function contributorsFromRows(
  rows: SwapSweepEvalRow[],
): CardDatabaseContributor[] {
  const byDeck = new Map<
    string,
    { name: string; runIds: Set<string>; samples: number }
  >();
  for (const row of rows) {
    const existing = byDeck.get(row.deckId);
    if (!existing) {
      byDeck.set(row.deckId, {
        name: row.deckName,
        runIds: new Set([row.runId]),
        samples: row.samples,
      });
      continue;
    }
    existing.runIds.add(row.runId);
    existing.samples += row.samples;
  }

  const totalSamples = [...byDeck.values()].reduce(
    (sum, row) => sum + row.samples,
    0,
  );
  const contributors: CardDatabaseContributor[] = [...byDeck.entries()]
    .map(([deckId, row]) => ({
      deckId: swapSweepVirtualDeckId(deckId),
      name: swapSweepVirtualDeckName(row.name),
      runCount: row.runIds.size,
      samples: row.samples,
      sampleShare: totalSamples > 0 ? row.samples / totalSamples : 0,
    }))
    .sort((a, b) => b.samples - a.samples);

  return contributors;
}

function cardIdsFromEvalRows(rows: SwapSweepEvalRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const stat of row.cardStats ?? []) {
      ids.add(stat.card);
    }
  }
  return [...ids];
}

export async function loadSwapSweepSlice(
  db: Kysely<Database>,
  options: SwapSweepQuery,
): Promise<SwapSweepSlice> {
  const allRows = await loadSwapSweepEvalRows(db, {
    ...options,
    deckIds: undefined,
  });
  const contributors = contributorsFromRows(allRows);
  const sourceDeckIds = sourceDeckIdsFromFilter(options.deckIds);
  const rows =
    sourceDeckIds === undefined
      ? allRows
      : allRows.filter((row) => sourceDeckIds.includes(row.deckId));
  const totalRuns = new Set(rows.map((row) => row.runId)).size;
  const totalSamples = rows.reduce((sum, row) => sum + row.samples, 0);
  const performanceByCard = new Map<string, CardPerformance>();
  for (const cardId of cardIdsFromEvalRows(rows)) {
    performanceByCard.set(cardId, aggregateSwapPerformance(rows, cardId));
  }

  let olderCardIds = new Set<string>();
  if (options.currentVersion && options.currentAttributionVersion != null) {
    const olderRows = await loadSwapSweepEvalRows(db, {
      ...options,
      otherVersions: true,
    });
    olderCardIds = new Set(cardIdsFromEvalRows(olderRows));
  }

  return {
    contributors,
    performanceByCard,
    totalRuns,
    totalSamples,
    olderCardIds,
  };
}

export async function loadSwapSweepCardDeckRows(
  db: Kysely<Database>,
  cardId: string,
  options: SwapSweepQuery,
): Promise<CardDatabaseDeckRow[]> {
  const rows = (await loadSwapSweepEvalRows(db, options)).filter((row) =>
    statForCard(row.cardStats, cardId),
  );
  const byDeck = new Map<
    string,
    {
      name: string;
      runIds: Set<string>;
      samples: number;
      seen: number;
      damageWhenSeenSum: number;
      copies: number | null;
      handBuckets: StoredHandBuckets;
    }
  >();

  for (const row of rows) {
    const stat = statForCard(row.cardStats, cardId)!;
    const buckets = handBucketsFromStat(stat);
    const existing = byDeck.get(row.deckId);
    if (!existing) {
      byDeck.set(row.deckId, {
        name: row.deckName,
        runIds: new Set([row.runId]),
        samples: row.samples,
        seen: stat.seen,
        damageWhenSeenSum: stat.damageWhenSeenSum,
        copies: stat.copies,
        handBuckets: { ...buckets },
      });
      continue;
    }
    existing.runIds.add(row.runId);
    existing.samples += row.samples;
    existing.seen += stat.seen;
    existing.damageWhenSeenSum += stat.damageWhenSeenSum;
    existing.handBuckets.withHandDamageSum += buckets.withHandDamageSum;
    existing.handBuckets.withHandSamples += buckets.withHandSamples;
    existing.handBuckets.withoutHandDamageSum += buckets.withoutHandDamageSum;
    existing.handBuckets.withoutHandSamples += buckets.withoutHandSamples;
  }

  return [...byDeck.entries()].map(([deckId, row]) => {
    const impact = impactFromBuckets(row.handBuckets);
    return {
      deckId: swapSweepVirtualDeckId(deckId),
      name: swapSweepVirtualDeckName(row.name),
      copies: row.copies,
      runCount: row.runIds.size,
      samples: row.samples,
      damageWhenSeen: row.seen > 0 ? row.damageWhenSeenSum / row.seen : 0,
      withHandMean: impact.withHandMean,
      withoutHandMean: impact.withoutHandMean,
      handLift: impact.handLift,
      withHandSamples: impact.withHandSamples,
      withoutHandSamples: impact.withoutHandSamples,
    };
  });
}
