import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { histogramStats, mergeHistograms } from "../lib/histogram.js";
import type { VersionTriple } from "../lib/version.js";

const COMPLETE = "complete" as const;

export async function listVersionGroups(
  db: Kysely<Database>,
  options: { deckHash?: string; simType?: string; kind?: "evaluate" | "optimize" },
) {
  let query = db
    .selectFrom("runs")
    .select([
      "rules_version as rulesVersion",
      "sampler_version as samplerVersion",
      "card_digest as cardDigest",
      "attribution_version as attributionVersion",
      sql<number>`count(*)::int`.as("runCount"),
    ])
    .where("status", "=", COMPLETE)
    .where("rules_version", "is not", null)
    .where("sampler_version", "is not", null)
    .where("card_digest", "is not", null);

  if (options.kind) {
    query = query.where("kind", "=", options.kind);
  }
  if (options.deckHash) {
    query = query.where("deck_hash", "=", options.deckHash);
  }
  if (options.simType) {
    query = query.where("sim_type", "=", options.simType);
  }

  return query
    .groupBy([
      "rules_version",
      "sampler_version",
      "card_digest",
      "attribution_version",
    ])
    .orderBy("runCount", "desc")
    .execute();
}

export async function pooledDamageDistribution(
  db: Kysely<Database>,
  options: {
    deckHash: string;
    simType: string;
    version: VersionTriple;
  },
) {
  const runs = await db
    .selectFrom("runs")
    .select(["id", "damage_histogram"])
    .where("status", "=", COMPLETE)
    .where("kind", "=", "evaluate")
    .where("deck_hash", "=", options.deckHash)
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.version.rulesVersion)
    .where("sampler_version", "=", options.version.samplerVersion)
    .where("card_digest", "=", options.version.cardDigest)
    .where("damage_histogram", "is not", null)
    .execute();

  if (runs.length === 0) {
    return {
      runCount: 0,
      distribution: null,
      version: options.version,
      deckHash: options.deckHash,
      simType: options.simType,
    };
  }

  const histograms = runs
    .map((run) => run.damage_histogram)
    .filter((value): value is number[] => Array.isArray(value));

  const merged = mergeHistograms(histograms);
  const distribution = histogramStats(merged);

  return {
    runCount: runs.length,
    distribution,
    version: options.version,
    deckHash: options.deckHash,
    simType: options.simType,
  };
}

export async function cardLeaderboard(
  db: Kysely<Database>,
  options: {
    deckHash: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
  },
) {
  const runCountRow = await db
    .selectFrom("runs")
    .select(sql<number>`count(*)::int`.as("runCount"))
    .where("status", "=", COMPLETE)
    .where("kind", "=", "evaluate")
    .where("deck_hash", "=", options.deckHash)
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.version.rulesVersion)
    .where("sampler_version", "=", options.version.samplerVersion)
    .where("card_digest", "=", options.version.cardDigest)
    .where("attribution_version", "=", options.attributionVersion)
    .executeTakeFirst();

  const rows = await db
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
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_hash", "=", options.deckHash)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.card_digest", "=", options.version.cardDigest)
    .where("r.attribution_version", "=", options.attributionVersion)
    .groupBy("cs.card_id")
    .orderBy(sql`sum(cs.damage) desc`)
    .execute();

  const sampleRow = await db
    .selectFrom("runs")
    .select(sql<number>`sum(coalesce(samples, 0))::int`.as("totalSamples"))
    .where("status", "=", COMPLETE)
    .where("kind", "=", "evaluate")
    .where("deck_hash", "=", options.deckHash)
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.version.rulesVersion)
    .where("sampler_version", "=", options.version.samplerVersion)
    .where("card_digest", "=", options.version.cardDigest)
    .where("attribution_version", "=", options.attributionVersion)
    .executeTakeFirst();

  const totalSamples = sampleRow?.totalSamples ?? 0;
  const totalDamage = rows.reduce((sum, row) => sum + row.damage, 0);

  return {
    runCount: runCountRow?.runCount ?? 0,
    totalSamples,
    version: options.version,
    attributionVersion: options.attributionVersion,
    deckHash: options.deckHash,
    simType: options.simType,
    cards: rows.map((row) => {
      const seen = row.seen;
      return {
        cardId: row.cardId,
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
        playWhenSeen: seen > 0 ? row.plays / seen : 0,
        damageWhenSeen: seen > 0 ? row.damageWhenSeenSum / seen : 0,
        damageShare: totalDamage > 0 ? row.damage / totalDamage : 0,
      };
    }),
  };
}

export async function rankedCandidates(
  db: Kysely<Database>,
  options: { version: VersionTriple },
) {
  const rows = await db
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
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "optimize")
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.card_digest", "=", options.version.cardDigest)
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
    kind?: "evaluate" | "optimize";
    limit?: number;
  },
) {
  let query = db
    .selectFrom("runs")
    .select([
      "id",
      "kind",
      "status",
      "sim_type as simType",
      "deck_hash as deckHash",
      "root_seed as rootSeed",
      "samples",
      "mean_damage as meanDamage",
      "p50_damage as p50Damage",
      "best_score as bestScore",
      "rules_version as rulesVersion",
      "sampler_version as samplerVersion",
      "attribution_version as attributionVersion",
      "card_digest as cardDigest",
      "build",
      "started_at as startedAt",
      "completed_at as completedAt",
      "elapsed_ms as elapsedMs",
    ])
    .orderBy("started_at", "desc")
    .limit(options.limit ?? 100);

  if (options.deckHash) {
    query = query.where("deck_hash", "=", options.deckHash);
  }
  if (options.kind) {
    query = query.where("kind", "=", options.kind);
  }

  return query.execute();
}
