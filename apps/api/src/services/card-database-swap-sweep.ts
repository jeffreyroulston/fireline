import { sql, type Kysely } from "kysely";
import type { CardStat } from "@ga-fire/contracts";
import type { Database } from "../db/types.js";
import { getCards, type CatalogCard } from "./card-catalog.js";
import type { CardPerformance } from "./card-database.js";

const COMPLETE = "complete" as const;
const SWAP_SWEEP = "swapSweep" as const;

export type CardDatabaseRunContributor = {
  runId: string;
  deckId: string;
  deckName: string;
  startedAt: string;
  candidateCount: number;
  samples: number;
};

type SwapSweepEvalRow = {
  runId: string;
  deckId: string;
  deckName: string;
  startedAt: Date;
  candidate: string | null;
  scoreDelta: number | null;
  score: number | null;
  samples: number;
  cardStats: CardStat[] | null;
};

function statForCard(
  stats: CardStat[] | null | undefined,
  cardId: string,
): CardStat | null {
  if (!stats) return null;
  return stats.find((row) => row.card === cardId) ?? null;
}

function baselineByRun(
  rows: SwapSweepEvalRow[],
): Map<string, SwapSweepEvalRow> {
  const map = new Map<string, SwapSweepEvalRow>();
  for (const row of rows) {
    if (row.candidate === null) {
      map.set(row.runId, row);
    }
  }
  return map;
}

/** Deck score Δ when this row tests swapping the card in; otherwise dmg-when-seen Δ vs baseline. */
function cardLiftForRow(
  row: SwapSweepEvalRow,
  cardId: string,
  baselines: Map<string, SwapSweepEvalRow>,
): number | null {
  if (row.candidate === cardId && row.scoreDelta != null) {
    return row.scoreDelta;
  }
  if (row.candidate === null) {
    return null;
  }
  const baseline = baselines.get(row.runId);
  if (!baseline) {
    return null;
  }
  const stat = statForCard(row.cardStats, cardId);
  const baseStat = statForCard(baseline.cardStats, cardId);
  if (!stat || !baseStat) {
    return null;
  }
  return stat.damageWhenSeen - baseStat.damageWhenSeen;
}

function aggregateSwapPerformance(
  rows: SwapSweepEvalRow[],
  cardId: string,
): CardPerformance {
  const matching = rows.filter((row) => statForCard(row.cardStats, cardId));
  if (matching.length === 0) {
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

  const baselines = baselineByRun(rows);
  let opened = 0;
  let seen = 0;
  let plays = 0;
  let damage = 0;
  let damageWhenSeenSum = 0;
  let eligibleSamples = 0;
  let scoreDeltaSum = 0;
  let scoreDeltaWeight = 0;
  let variantDmgSum = 0;
  let variantWeight = 0;
  let baselineDmgSum = 0;
  let baselineWeight = 0;
  let liftSum = 0;
  let liftWeight = 0;
  const deckIds = new Set<string>();
  const runIds = new Set<string>();

  for (const row of matching) {
    deckIds.add(row.deckId);
    runIds.add(row.runId);
    eligibleSamples += row.samples;
    const stat = statForCard(row.cardStats, cardId)!;
    opened += stat.opened;
    seen += stat.seen;
    plays += stat.plays;
    damage += stat.damage;
    damageWhenSeenSum += stat.damageWhenSeenSum;

    const lift = cardLiftForRow(row, cardId, baselines);
    if (lift != null && row.candidate !== null) {
      liftSum += lift * row.samples;
      liftWeight += row.samples;
    }

    if (row.candidate === cardId && row.scoreDelta != null) {
      scoreDeltaSum += row.scoreDelta * row.samples;
      scoreDeltaWeight += row.samples;
    } else if (row.candidate !== null) {
      const baseline = baselines.get(row.runId);
      const baseStat = baseline
        ? statForCard(baseline.cardStats, cardId)
        : null;
      if (baseStat) {
        variantDmgSum += stat.damageWhenSeen * row.samples;
        variantWeight += row.samples;
        baselineDmgSum += baseStat.damageWhenSeen * row.samples;
        baselineWeight += row.samples;
      }
    }
  }

  const withHandMean =
    scoreDeltaWeight > 0
      ? scoreDeltaSum / scoreDeltaWeight
      : variantWeight > 0
        ? variantDmgSum / variantWeight
        : null;
  const withoutHandMean =
    baselineWeight > 0 ? baselineDmgSum / baselineWeight : null;
  const handLift =
    scoreDeltaWeight > 0
      ? scoreDeltaSum / scoreDeltaWeight
      : liftWeight > 0
        ? liftSum / liftWeight
        : null;

  return {
    runCount: runIds.size,
    deckCount: deckIds.size,
    eligibleSamples,
    opened,
    openedCopies: opened,
    drawn: 0,
    seen,
    plays,
    attacks: 0,
    damage,
    openRate: eligibleSamples > 0 ? opened / eligibleSamples : 0,
    seeRate: eligibleSamples > 0 ? seen / eligibleSamples : 0,
    playWhenInHand: seen > 0 ? plays / seen : 0,
    damageWhenSeen: seen > 0 ? damageWhenSeenSum / seen : 0,
    withHandMean,
    withoutHandMean,
    handLift,
    withHandSamples: variantWeight || scoreDeltaWeight || eligibleSamples,
    withoutHandSamples: baselineWeight,
  };
}

async function loadSwapSweepEvalRows(
  db: Kysely<Database>,
  runIds?: string[],
): Promise<SwapSweepEvalRow[]> {
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
      "c.score_delta as scoreDelta",
      "c.score as score",
      "r.samples as samples",
      "c.card_stats as cardStats",
    ])
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "optimize")
    .where("r.optimize_strategy", "=", SWAP_SWEEP)
    .where("c.card_stats", "is not", null);

  if (runIds && runIds.length > 0) {
    query = query.where("r.id", "in", runIds);
  } else if (runIds && runIds.length === 0) {
    return [];
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    runId: row.runId,
    deckId: row.deckId!,
    deckName: row.deckName,
    startedAt: row.startedAt,
    candidate: row.candidate,
    scoreDelta: row.scoreDelta,
    score: row.score,
    samples: row.samples ?? 0,
    cardStats: row.cardStats as CardStat[] | null,
  }));
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

export async function swapSweepRunContributors(
  db: Kysely<Database>,
  runIds?: string[],
): Promise<CardDatabaseRunContributor[]> {
  let query = db
    .selectFrom("runs as r")
    .innerJoin("decks as d", "d.id", "r.deck_id")
    .leftJoin("run_candidates as c", (join) =>
      join
        .onRef("c.run_id", "=", "r.id")
        .on("c.candidate", "is not", null),
    )
    .select([
      "r.id as runId",
      "r.deck_id as deckId",
      "d.name as deckName",
      "r.started_at as startedAt",
      sql<number>`count(c.candidate)::int`.as("candidateCount"),
      sql<number>`coalesce(r.samples, 0)::int`.as("samples"),
    ])
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "optimize")
    .where("r.optimize_strategy", "=", SWAP_SWEEP)
    .groupBy(["r.id", "r.deck_id", "d.name", "r.started_at", "r.samples"])
    .orderBy("r.started_at", "desc");

  if (runIds && runIds.length > 0) {
    query = query.where("r.id", "in", runIds);
  } else if (runIds && runIds.length === 0) {
    return [];
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    runId: row.runId,
    deckId: row.deckId!,
    deckName: row.deckName,
    startedAt: row.startedAt.toISOString(),
    candidateCount: row.candidateCount,
    samples: row.samples * Math.max(row.candidateCount, 1),
  }));
}

export async function cardDatabaseSwapSweep(
  db: Kysely<Database>,
  options: { runIds?: string[] },
) {
  const catalog = await getCards(db);
  const rows = await loadSwapSweepEvalRows(db, options.runIds);
  const contributors = await swapSweepRunContributors(db, options.runIds);
  const statCardIds = cardIdsFromEvalRows(rows);

  const cards = catalog
    .filter((card) => statCardIds.includes(card.id))
    .map((card) => ({
      ...card,
      performance: aggregateSwapPerformance(rows, card.id),
      hasOlderData: false,
    }))
    .sort((a, b) => {
      const liftA = a.performance?.handLift ?? -Infinity;
      const liftB = b.performance?.handLift ?? -Infinity;
      if (liftB !== liftA) return liftB - liftA;
      const playA =
        a.performance && a.performance.eligibleSamples > 0
          ? a.performance.plays / a.performance.eligibleSamples
          : -Infinity;
      const playB =
        b.performance && b.performance.eligibleSamples > 0
          ? b.performance.plays / b.performance.eligibleSamples
          : -Infinity;
      return playB - playA;
    });

  const totalSamples = rows.reduce((sum, row) => sum + row.samples, 0);

  return {
    source: "swap_sweep" as const,
    totalRuns: contributors.length,
    totalSamples,
    contributors,
    cards,
  };
}

export type SwapSweepCardRunRow = {
  runId: string;
  deckId: string;
  deckName: string;
  startedAt: string;
  candidate: string | null;
  scoreDelta: number | null;
  handLift: number | null;
  playRate: number | null;
  openRate: number | null;
  seeRate: number | null;
  samples: number;
};

export async function cardDatabaseSwapSweepCardRuns(
  db: Kysely<Database>,
  cardId: string,
  options: { runIds?: string[] },
): Promise<{ runs: SwapSweepCardRunRow[] }> {
  const rows = await loadSwapSweepEvalRows(db, options.runIds).then((all) =>
    all.filter((row) => statForCard(row.cardStats, cardId)),
  );
  const baselines = baselineByRun(rows);

  return {
    runs: rows.map((row) => {
      const stat = statForCard(row.cardStats, cardId)!;
      const handLift = cardLiftForRow(row, cardId, baselines);
      return {
        runId: row.runId,
        deckId: row.deckId,
        deckName: row.deckName,
        startedAt: row.startedAt.toISOString(),
        candidate: row.candidate,
        scoreDelta: row.candidate === cardId ? row.scoreDelta : null,
        handLift,
        playRate: stat.playRate ?? null,
        openRate: stat.openRate ?? null,
        seeRate: stat.seeRate ?? null,
        samples: row.samples,
      };
    }),
  };
}

export type CardDatabaseSwapSweepCard = CatalogCard & {
  performance: CardPerformance | null;
  hasOlderData: boolean;
};
