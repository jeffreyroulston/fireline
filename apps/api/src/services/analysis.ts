import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types.js";
import {
  coerceHistogram,
  coerceSampleDamages,
  expandHistogram,
  histogramStats,
  mergeHistograms,
} from "../lib/histogram.js";
import {
  reconstructSampleDamages,
  reconstructSampleHand,
} from "../lib/sample-order.js";
import { handHash } from "../lib/deck.js";
import {
  computeAllHandImpacts,
  evaluateSamplesFromRows,
  loadEvaluateSamples,
} from "../lib/hand-impact.js";
import { loadEventsBySampleId } from "../lib/load-sample-events.js";
import type { VersionTriple } from "../lib/version.js";
import { isMaterialCardId } from "../db/card-seed.js";
import {
  cardLeaderboardFromSamples,
  hasDamageBounds,
  type DamageBounds,
} from "./filtered-leaderboard.js";
import {
  applyRunSettingsFilter,
  type RunSettingsFilter,
} from "../lib/run-settings-filter.js";

const DONE_STATUSES = ["complete", "partial"] as const;
const MAX_POOLED_SAMPLE_BARS = 200;

export async function listVersionGroups(
  db: Kysely<Database>,
  options: {
    deckHash?: string;
    deckId?: string;
    simType?: string;
    kind?: "evaluate" | "optimize";
    runSettings?: RunSettingsFilter;
  },
) {
  let query = db
    .selectFrom("runs")
    .select([
      "rules_version as rulesVersion",
      "sampler_version as samplerVersion",
      "attribution_version as attributionVersion",
      sql<number>`count(*)::int`.as("runCount"),
    ])
    .where("status", "in", DONE_STATUSES)
    .where("rules_version", "is not", null)
    .where("sampler_version", "is not", null);

  if (options.kind) {
    query = query.where("kind", "=", options.kind);
  }
  if (options.deckId) {
    query = query.where("deck_id", "=", options.deckId);
  } else if (options.deckHash) {
    query = query.where("deck_hash", "=", options.deckHash);
  }
  if (options.simType) {
    query = query.where("sim_type", "=", options.simType);
  }

  query = applyRunSettingsFilter(query, options.runSettings);

  return query
    .groupBy(["rules_version", "sampler_version", "attribution_version"])
    .orderBy("runCount", "desc")
    .execute();
}

export async function pooledDamageDistribution(
  db: Kysely<Database>,
  options: {
    deckHash: string;
    simType: string;
    version: VersionTriple;
    runSettings?: RunSettingsFilter;
  },
) {
  let runsQuery = db
    .selectFrom("runs")
    .select([
      "id",
      "damage_histogram",
      "sample_damages",
      "deck_counts",
      "root_seed",
      "mean_damage",
      "mean_end_influence",
      "samples",
      "started_at",
    ])
    .where("status", "in", DONE_STATUSES)
    .where("kind", "=", "evaluate")
    .where("deck_hash", "=", options.deckHash)
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.version.rulesVersion)
    .where("sampler_version", "=", options.version.samplerVersion)
    .where("damage_histogram", "is not", null)
    .orderBy("started_at", "asc");

  runsQuery = applyRunSettingsFilter(runsQuery, options.runSettings);

  const runs = await runsQuery.execute();

  if (runs.length === 0) {
    return {
      runCount: 0,
      distribution: null,
      runs: [],
      version: options.version,
      deckHash: options.deckHash,
      simType: options.simType,
    };
  }

  const sampleRows = await db
    .selectFrom("run_samples")
    .select(["run_id", "hand_hash", "damage"])
    .where(
      "run_id",
      "in",
      runs.map((run) => run.id),
    )
    .execute();

  const handDamagesByRun = new Map<string, Map<string, number>>();
  for (const row of sampleRows) {
    let handDamages = handDamagesByRun.get(row.run_id);
    if (!handDamages) {
      handDamages = new Map();
      handDamagesByRun.set(row.run_id, handDamages);
    }
    handDamages.set(row.hand_hash, row.damage);
  }

  const parsed = runs.flatMap((run) => {
    const histogram = coerceHistogram(run.damage_histogram);
    if (!histogram) {
      return [];
    }
    const damages =
      coerceSampleDamages(run.sample_damages) ??
      reconstructSampleDamages({
        deckCounts: run.deck_counts,
        rootSeed: run.root_seed,
        samples: run.samples ?? 0,
        handDamages: handDamagesByRun.get(run.id) ?? new Map(),
      }) ??
      expandHistogram(histogram);
    return [
      {
        histogram,
        meanEndInfluence: run.mean_end_influence,
        sampleRun: {
          id: run.id,
          startedAt: run.started_at.toISOString(),
          samples: run.samples,
          meanDamage: run.mean_damage,
          damages,
        },
      },
    ];
  });

  const merged = mergeHistograms(parsed.map((entry) => entry.histogram));
  const damageStats = histogramStats(merged);
  let influenceWeighted = 0;
  let influenceSamples = 0;
  for (const entry of parsed) {
    const samples = entry.sampleRun.samples ?? entry.sampleRun.damages.length;
    if (entry.meanEndInfluence == null || samples <= 0) {
      continue;
    }
    influenceWeighted += entry.meanEndInfluence * samples;
    influenceSamples += samples;
  }
  const distribution = damageStats
    ? {
        ...damageStats,
        meanEndInfluence:
          influenceSamples > 0 ? influenceWeighted / influenceSamples : null,
      }
    : null;

  return {
    runCount: parsed.length,
    distribution,
    runs: trimRunsToRecentBarSamples(parsed.map((entry) => entry.sampleRun)),
    version: options.version,
    deckHash: options.deckHash,
    simType: options.simType,
  };
}

type PooledSampleRun = {
  id: string;
  startedAt: string;
  samples: number | null;
  meanDamage: number | null;
  damages: number[];
};

function trimRunsToRecentBarSamples(runs: PooledSampleRun[]): Array<
  Omit<PooledSampleRun, "damages"> & {
    damages?: number[];
    samplePoints?: Array<{ index: number; damage: number }>;
  }
> {
  const flat: Array<{
    runId: string;
    sampleIndex: number;
    damage: number;
    meta: Omit<PooledSampleRun, "damages">;
  }> = [];

  for (const run of runs) {
    const meta = {
      id: run.id,
      startedAt: run.startedAt,
      samples: run.samples,
      meanDamage: run.meanDamage,
    };
    for (let sampleIndex = 0; sampleIndex < run.damages.length; sampleIndex += 1) {
      flat.push({
        runId: run.id,
        sampleIndex,
        damage: run.damages[sampleIndex]!,
        meta,
      });
    }
  }

  if (flat.length <= MAX_POOLED_SAMPLE_BARS) {
    return runs;
  }

  const recent = flat.slice(-MAX_POOLED_SAMPLE_BARS);
  const byRun = new Map<
    string,
  {
    meta: Omit<PooledSampleRun, "damages">;
    samplePoints: Array<{ index: number; damage: number }>;
  }
  >();

  for (const entry of recent) {
    let grouped = byRun.get(entry.runId);
    if (!grouped) {
      grouped = { meta: entry.meta, samplePoints: [] };
      byRun.set(entry.runId, grouped);
    }
    grouped.samplePoints.push({
      index: entry.sampleIndex,
      damage: entry.damage,
    });
  }

  return [...byRun.values()].map(({ meta, samplePoints }) => ({
    ...meta,
    samplePoints,
  }));
}

export async function getPooledSample(
  db: Kysely<Database>,
  options: { runId: string; sampleIndex: number },
) {
  const run = await db
    .selectFrom("runs")
    .select([
      "id",
      "status",
      "sim_type as simType",
      "deck_counts as deckCounts",
      "root_seed as rootSeed",
      "samples",
      "sample_damages as sampleDamages",
    ])
    .where("id", "=", options.runId)
    .where("status", "in", DONE_STATUSES)
    .where("kind", "=", "evaluate")
    .executeTakeFirst();

  if (!run) {
    return null;
  }

  const sampleRows = await db
    .selectFrom("run_samples")
    .select(["id", "hand_hash", "card_ids", "damage", "nodes"])
    .where("run_id", "=", run.id)
    .execute();

  const handDamages = new Map<string, number>();
  for (const row of sampleRows) {
    handDamages.set(row.hand_hash, row.damage);
  }

  const damages =
    coerceSampleDamages(run.sampleDamages) ??
    reconstructSampleDamages({
      deckCounts: run.deckCounts,
      rootSeed: run.rootSeed,
      samples: run.samples ?? 0,
      handDamages,
    });

  if (
    !damages ||
    options.sampleIndex < 0 ||
    options.sampleIndex >= damages.length
  ) {
    return null;
  }

  const hand = reconstructSampleHand({
    deckCounts: run.deckCounts,
    rootSeed: run.rootSeed,
    sampleIndex: options.sampleIndex,
  });
  if (!hand) {
    return null;
  }

  const hash = handHash(hand);
  const sample = sampleRows.find((row) => row.hand_hash === hash);
  const eventsBySample = sample
    ? await loadEventsBySampleId(db, [sample.id])
    : new Map();

  return {
    runId: run.id,
    sampleId: sample?.id ?? null,
    sampleIndex: options.sampleIndex,
    simType: run.simType,
    hand: sample?.card_ids ?? hand,
    damage: damages[options.sampleIndex]!,
    nodes: sample ? Number(sample.nodes) : 0,
    events: sample ? (eventsBySample.get(sample.id) ?? []) : [],
  };
}

export async function pooledSampleHighlights(
  db: Kysely<Database>,
  options: {
    deckHash: string;
    simType: string;
    version: VersionTriple;
    runSettings?: RunSettingsFilter;
  },
) {
  let runsQuery = db
    .selectFrom("runs")
    .select([
      "id",
      "sample_damages",
      "deck_counts",
      "root_seed",
      "samples",
    ])
    .where("status", "in", DONE_STATUSES)
    .where("kind", "=", "evaluate")
    .where("deck_hash", "=", options.deckHash)
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.version.rulesVersion)
    .where("sampler_version", "=", options.version.samplerVersion)
    .orderBy("started_at", "asc");

  runsQuery = applyRunSettingsFilter(runsQuery, options.runSettings);

  const runs = await runsQuery.execute();

  if (runs.length === 0) {
    return {
      samples: [] as Array<{
        runId: string;
        sampleIndex: number;
        inHand: string[];
        played: string[];
      }>,
    };
  }

  const sampleRows = await db
    .selectFrom("run_samples")
    .select(["id", "run_id", "hand_hash", "card_ids", "damage"])
    .where(
      "run_id",
      "in",
      runs.map((run) => run.id),
    )
    .execute();

  const sampleIds = sampleRows.map((row) => row.id);
  const playRows =
    sampleIds.length === 0
      ? []
      : await db
          .selectFrom("run_sample_card_stats")
          .select(["sample_id", "card_id", "plays", "attacks"])
          .where("sample_id", "in", sampleIds)
          .execute();

  const playsBySample = new Map<string, Map<string, number>>();
  const attacksBySample = new Map<string, Map<string, number>>();
  for (const row of playRows) {
    let byCard = playsBySample.get(row.sample_id);
    if (!byCard) {
      byCard = new Map();
      playsBySample.set(row.sample_id, byCard);
    }
    byCard.set(row.card_id, row.plays);
    let attacksByCard = attacksBySample.get(row.sample_id);
    if (!attacksByCard) {
      attacksByCard = new Map();
      attacksBySample.set(row.sample_id, attacksByCard);
    }
    attacksByCard.set(row.card_id, row.attacks);
  }

  const samplesByRun = new Map<
    string,
    Map<string, { id: string; cardIds: string[] }>
  >();
  const handDamagesByRun = new Map<string, Map<string, number>>();
  for (const row of sampleRows) {
    let byHand = samplesByRun.get(row.run_id);
    if (!byHand) {
      byHand = new Map();
      samplesByRun.set(row.run_id, byHand);
    }
    byHand.set(row.hand_hash, { id: row.id, cardIds: row.card_ids });
    let handDamages = handDamagesByRun.get(row.run_id);
    if (!handDamages) {
      handDamages = new Map();
      handDamagesByRun.set(row.run_id, handDamages);
    }
    handDamages.set(row.hand_hash, row.damage);
  }

  const samples: Array<{
    runId: string;
    sampleIndex: number;
    inHand: string[];
    played: string[];
  }> = [];

  for (const run of runs) {
    const damages =
      coerceSampleDamages(run.sample_damages) ??
      reconstructSampleDamages({
        deckCounts: run.deck_counts,
        rootSeed: run.root_seed,
        samples: run.samples ?? 0,
        handDamages: handDamagesByRun.get(run.id) ?? new Map(),
      });
    if (!damages) {
      continue;
    }

    const byHand = samplesByRun.get(run.id) ?? new Map();
    for (let sampleIndex = 0; sampleIndex < damages.length; sampleIndex += 1) {
      const hand = reconstructSampleHand({
        deckCounts: run.deck_counts,
        rootSeed: run.root_seed,
        sampleIndex,
      });
      if (!hand) {
        continue;
      }
      const stored = byHand.get(handHash(hand));
      const openingHand = stored?.cardIds ?? hand;
      const playCounts = stored
        ? (playsBySample.get(stored.id) ?? new Map())
        : new Map();
      const attackCounts = stored
        ? (attacksBySample.get(stored.id) ?? new Map())
        : new Map();
      const openingCopies = new Map<string, number>();
      for (const cardId of openingHand) {
        openingCopies.set(cardId, (openingCopies.get(cardId) ?? 0) + 1);
      }
      const played: string[] = [];
      for (const [cardId, copies] of openingCopies) {
        if ((playCounts.get(cardId) ?? 0) >= copies) {
          played.push(cardId);
        }
      }
      const usedIds = new Set([...playCounts.keys(), ...attackCounts.keys()]);
      for (const cardId of usedIds) {
        if (!isMaterialCardId(cardId) || played.includes(cardId)) {
          continue;
        }
        if ((playCounts.get(cardId) ?? 0) > 0 || (attackCounts.get(cardId) ?? 0) > 0) {
          played.push(cardId);
        }
      }
      samples.push({
        runId: run.id,
        sampleIndex,
        inHand: openingHand,
        played,
      });
    }
  }

  return { samples };
}

export async function cardLeaderboard(
  db: Kysely<Database>,
  options: {
    deckHash: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    bounds?: DamageBounds;
    cards?: Array<{ id: string; name: string }>;
    runSettings?: RunSettingsFilter;
  },
) {
  if (hasDamageBounds(options.bounds) && options.cards) {
    return cardLeaderboardFromSamples(db, {
      deckHash: options.deckHash,
      simType: options.simType,
      version: options.version,
      attributionVersion: options.attributionVersion,
      bounds: options.bounds!,
      cards: options.cards,
      runSettings: options.runSettings,
    });
  }

  let runCountQuery = db
    .selectFrom("runs")
    .select(sql<number>`count(*)::int`.as("runCount"))
    .where("status", "in", DONE_STATUSES)
    .where("kind", "=", "evaluate")
    .where("deck_hash", "=", options.deckHash)
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.version.rulesVersion)
    .where("sampler_version", "=", options.version.samplerVersion)
    .where("attribution_version", "=", options.attributionVersion);

  runCountQuery = applyRunSettingsFilter(runCountQuery, options.runSettings);

  const runCountRow = await runCountQuery.executeTakeFirst();

  let statsQuery = db
    .selectFrom("run_card_stats as cs")
    .innerJoin("runs as r", "r.id", "cs.run_id")
    .select([
      "cs.card_id as cardId",
      sql<number>`sum(cs.copies)::int`.as("copies"),
      sql<number>`sum(cs.opened)::int`.as("opened"),
      sql<number>`sum(cs.opened_copies)::int`.as("openedCopies"),
      sql<number>`sum(cs.drawn)::int`.as("drawn"),
      sql<number>`sum(cs.seen)::int`.as("seen"),
      sql<number>`sum(cs.plays)::int`.as("plays"),
      sql<number>`sum(cs.attacks)::int`.as("attacks"),
      sql<number>`sum(cs.damage)::int`.as("damage"),
      sql<number>`sum(cs.damage_when_seen_sum)::int`.as("damageWhenSeenSum"),
    ])
    .where("r.status", "in", DONE_STATUSES)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_hash", "=", options.deckHash)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.attribution_version", "=", options.attributionVersion)
    .groupBy("cs.card_id")
    .orderBy(sql`sum(cs.damage) desc`);

  statsQuery = applyRunSettingsFilter(statsQuery, options.runSettings, "r");

  const rows = await statsQuery.execute();

  let sampleQuery = db
    .selectFrom("runs")
    .select(sql<number>`sum(coalesce(samples, 0))::int`.as("totalSamples"))
    .where("status", "in", DONE_STATUSES)
    .where("kind", "=", "evaluate")
    .where("deck_hash", "=", options.deckHash)
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.version.rulesVersion)
    .where("sampler_version", "=", options.version.samplerVersion)
    .where("attribution_version", "=", options.attributionVersion);

  sampleQuery = applyRunSettingsFilter(sampleQuery, options.runSettings);

  const sampleRow = await sampleQuery.executeTakeFirst();

  const totalSamples = sampleRow?.totalSamples ?? 0;
  const totalDamage = rows.reduce((sum, row) => sum + row.damage, 0);
  const runCount = runCountRow?.runCount ?? 0;

  const evaluateSamples = await loadEvaluateSamples(db, {
    deckHash: options.deckHash,
    simType: options.simType,
    version: options.version,
    attributionVersion: options.attributionVersion,
    runSettings: options.runSettings,
  });
  const handLiftByCard = computeAllHandImpacts(evaluateSamples);

  return {
    runCount,
    totalSamples,
    version: options.version,
    attributionVersion: options.attributionVersion,
    deckHash: options.deckHash,
    simType: options.simType,
    cards: rows.map((row) => {
      const seen = row.seen;
      const handAppearances = row.openedCopies + row.drawn;
      return {
        cardId: row.cardId,
        deckCopies: Math.round(row.copies / Math.max(runCount, 1)),
        copies: row.copies,
        opened: row.opened,
        openedCopies: row.openedCopies,
        drawn: row.drawn,
        seen: row.seen,
        plays: row.plays,
        attacks: row.attacks,
        damage: row.damage,
        openRate: totalSamples > 0 ? row.opened / totalSamples : 0,
        seeRate: totalSamples > 0 ? row.seen / totalSamples : 0,
        playWhenInHand: handAppearances > 0 ? row.plays / handAppearances : 0,
        damageWhenSeen: seen > 0 ? row.damageWhenSeenSum / seen : 0,
        damageShare: totalDamage > 0 ? row.damage / totalDamage : 0,
        handLift: handLiftByCard.get(row.cardId)?.handLift ?? null,
      };
    }),
  };
}

export async function rankedCandidates(
  db: Kysely<Database>,
  options: {
    version: VersionTriple;
    deckId?: string;
    deckHash?: string;
  },
) {
  let query = db
    .selectFrom("run_candidates as c")
    .innerJoin("runs as r", "r.id", "c.run_id")
    .select([
      "c.deck_hash as deckHash",
      "c.counts as counts",
      sql<number>`count(*)::int`.as("appearances"),
      sql<number>`count(*) filter (where c.rank = 1)::int`.as("wins"),
      sql<number>`avg(c.score)::float8`.as("avgScore"),
      sql<number>`max(c.score)::float8`.as("bestScore"),
    ])
    .where("r.status", "in", DONE_STATUSES)
    .where("r.kind", "=", "optimize")
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion);

  if (options.deckId) {
    query = query.where("r.deck_id", "=", options.deckId);
  } else if (options.deckHash) {
    query = query.where("r.deck_hash", "=", options.deckHash);
  }

  const rows = await query
    .groupBy(["c.deck_hash", "c.counts"])
    .orderBy("wins", "desc")
    .orderBy("avgScore", "desc")
    .limit(50)
    .execute();

  return {
    version: options.version,
    candidates: rows.map((row, index) => ({
      rank: index + 1,
      deckHash: row.deckHash,
      counts: row.counts,
      appearances: row.appearances,
      wins: row.wins,
      avgScore: row.avgScore,
      bestScore: row.bestScore,
    })),
  };
}

export async function listRunHistory(
  db: Kysely<Database>,
  options: {
    deckHash?: string;
    deckId?: string;
    kind?: "evaluate" | "optimize";
    limit?: number;
  },
) {
  let query = db
    .selectFrom("runs")
    .leftJoin("decks", "decks.id", "runs.deck_id")
    .select([
      "runs.id as id",
      "runs.kind as kind",
      "runs.status as status",
      "runs.sim_type as simType",
      "runs.deck_hash as deckHash",
      "runs.deck_id as deckId",
      "decks.name as deckName",
      "runs.root_seed as rootSeed",
      "runs.samples as samples",
      "runs.rollouts as rollouts",
      "runs.go_first as goFirst",
      "runs.max_turns as maxTurns",
      "runs.metric as metric",
      "runs.optimize_strategy as optimizeStrategy",
      "runs.request_body as requestBody",
      "runs.mean_damage as meanDamage",
      "runs.p50_damage as p50Damage",
      "runs.best_score as bestScore",
      "runs.rules_version as rulesVersion",
      "runs.sampler_version as samplerVersion",
      "runs.attribution_version as attributionVersion",
      "runs.card_digest as cardDigest",
      "runs.build as build",
      "runs.started_at as startedAt",
      "runs.completed_at as completedAt",
      "runs.elapsed_ms as elapsedMs",
      "runs.error_message as errorMessage",
    ])
    .orderBy("runs.started_at", "desc")
    .limit(options.limit ?? 100);

  if (options.deckId) {
    query = query.where("runs.deck_id", "=", options.deckId);
  } else if (options.deckHash) {
    query = query.where("runs.deck_hash", "=", options.deckHash);
  }
  if (options.kind) {
    query = query.where("runs.kind", "=", options.kind);
  } else {
    // Hand-solver rows are stored for line IDs; keep them out of the history UI.
    query = query.where("runs.kind", "in", ["evaluate", "optimize"]);
  }

  const rows = await query.execute();
  return rows.map((row) => {
    const body = (row.requestBody ?? {}) as Record<string, unknown>;
    const { requestBody: _requestBody, ...rest } = row;
    return {
      ...rest,
      maxThreads: numberOrNull(body.maxThreads),
      glimpseEnabled: boolOrNull(body.glimpseEnabled),
      maxHandDurationSecs: numberOrNull(body.maxHandDurationSecs),
      maxCardDraw: numberOrNull(body.maxCardDraw),
    };
  });
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
