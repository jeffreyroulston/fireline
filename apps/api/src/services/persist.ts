import type { Kysely } from "kysely";
import type {
  DeckEvalResult,
  EffectiveRequest,
  LineEvent,
  OptimizeResult,
  SolveRequest,
  SolveResult,
  SparseLineStats,
} from "@ga-fire/contracts";
import type { Database } from "../db/types.js";
import { deckHash, damageHistogram, handHash, newId } from "../lib/deck.js";
import { toJsonb } from "../lib/jsonb.js";
import { lineEventToRow, sparseStatsRows } from "../lib/line-events.js";

function normalizeCounts(counts: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0),
  );
}

function effectiveVersionFields(effective: EffectiveRequest) {
  return {
    rules_version: effective.engineVersion.rules,
    sampler_version: effective.engineVersion.sampler,
    attribution_version: effective.engineVersion.attribution,
    card_digest: String(effective.engineVersion.cardDigest),
    build: effective.engineVersion.build,
  };
}

function effectiveRunFields(effective: EffectiveRequest) {
  const bounds = (effective.bounds ?? null) as Record<string, { min: number; max: number }> | null;
  return {
    sim_type: effective.simType ?? null,
    root_seed: effective.rootSeed != null ? String(effective.rootSeed) : null,
    deck_counts: toJsonb(normalizeCounts(effective.deck ?? {})),
    go_first: effective.goFirst ?? null,
    max_turns: effective.maxTurns ?? null,
    rollouts: effective.rollouts ?? null,
    samples: effective.samples ?? null,
    budget: effective.budget != null ? toJsonb(effective.budget) : null,
    metric: effective.metric ?? null,
    bounds: bounds != null ? toJsonb(bounds) : null,
    deck_size: effective.deckSize ?? null,
    decks_requested: effective.decks ?? null,
    deck_hash: deckHash(normalizeCounts(effective.deck ?? {})),
    ...effectiveVersionFields(effective),
  };
}

async function insertSampleEvents(
  trx: Kysely<Database>,
  sampleId: string,
  events: LineEvent[] | null | undefined,
): Promise<void> {
  if (!events || events.length === 0) {
    return;
  }
  const rows = events.map((event, seq) => lineEventToRow(sampleId, seq, event));
  const chunkSize = 200;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    await trx
      .insertInto("run_sample_events")
      .values(rows.slice(offset, offset + chunkSize))
      .execute();
  }
}

async function insertSampleCardStats(
  trx: Kysely<Database>,
  sampleId: string,
  stats: SparseLineStats | null | undefined,
): Promise<void> {
  const rows = sparseStatsRows(sampleId, stats);
  if (rows.length === 0) {
    return;
  }
  await trx.insertInto("run_sample_card_stats").values(rows).execute();
}

/** Persist a hand-solver result and return the `run_samples` row id. */
export async function persistSolveResult(
  db: Kysely<Database>,
  request: SolveRequest,
  result: SolveResult,
): Promise<{ runId: string; sampleId: string }> {
  const runId = newId();
  const sampleId = newId();
  const now = new Date();
  const hand = [...request.hand];
  const damage = result.maxDamage;

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("runs")
      .values({
        id: runId,
        kind: "solve",
        status: "complete",
        started_at: now,
        completed_at: now,
        elapsed_ms: result.elapsedMs,
        mean_damage: damage,
        p10_damage: damage,
        p50_damage: damage,
        p90_damage: damage,
        mean_end_influence: result.endInfluence,
        max_damage: damage,
        min_damage: damage,
        request_body: toJsonb({
          hand,
          goFirst: request.goFirst,
          maxTurns: request.maxTurns,
          simType: request.simType,
          deck: request.deck ?? {},
          rollouts: request.rollouts,
          seed: request.seed != null ? String(request.seed) : null,
        }),
        ...effectiveRunFields(result.effective),
      })
      .execute();

    await trx
      .insertInto("run_samples")
      .values({
        id: sampleId,
        run_id: runId,
        hand_hash: handHash(hand),
        card_ids: toJsonb(hand),
        occurrence_count: 1,
        damage,
        nodes: String(result.nodes),
      })
      .execute();

    await insertSampleEvents(trx, sampleId, result.events);
    await insertSampleCardStats(trx, sampleId, result.lineCardStats);
  });

  return { runId, sampleId };
}

export async function persistEvaluateResult(
  db: Kysely<Database>,
  runId: string,
  result: DeckEvalResult,
): Promise<void> {
  const effective = result.effective;
  const handGroups = new Map<
    string,
    {
      cardIds: string[];
      damage: number;
      nodes: string;
      events: LineEvent[];
      lineCardStats: SparseLineStats | undefined;
      count: number;
    }
  >();

  for (const hand of result.hands) {
    const key = handHash(hand.hand);
    const existing = handGroups.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    handGroups.set(key, {
      cardIds: [...hand.hand],
      damage: hand.damage,
      nodes: String(hand.nodes),
      events: hand.events ?? [],
      lineCardStats: hand.lineCardStats,
      count: 1,
    });
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("runs")
      .set({
        status: "complete",
        completed_at: new Date(),
        elapsed_ms: result.elapsedMs,
        mean_damage: result.mean,
        p10_damage: result.p10,
        p50_damage: result.p50,
        p90_damage: result.p90,
        mean_end_influence: result.meanEndInfluence,
        max_damage: result.max,
        min_damage: result.min,
        damage_histogram: toJsonb(damageHistogram(result.damages)),
        sample_damages: toJsonb(result.damages),
        ...effectiveRunFields(effective),
      })
      .where("id", "=", runId)
      .execute();

    for (const [hash, sample] of handGroups) {
      const sampleId = newId();
      await trx
        .insertInto("run_samples")
        .values({
          id: sampleId,
          run_id: runId,
          hand_hash: hash,
          card_ids: toJsonb(sample.cardIds),
          occurrence_count: sample.count,
          damage: sample.damage,
          nodes: sample.nodes,
        })
        .execute();
      await insertSampleEvents(trx, sampleId, sample.events);
      await insertSampleCardStats(trx, sampleId, sample.lineCardStats);
    }

    for (const stat of result.cardStats ?? []) {
      await trx
        .insertInto("run_card_stats")
        .values({
          run_id: runId,
          card_id: stat.card,
          copies: stat.copies,
          opened: stat.opened,
          opened_copies: stat.openedCopies,
          drawn: stat.drawn,
          seen: stat.seen,
          plays: stat.plays,
          attacks: stat.attacks,
          damage: stat.damage,
          damage_when_seen_sum: stat.damageWhenSeenSum,
        })
        .execute();
    }
  });
}

export async function persistOptimizeResult(
  db: Kysely<Database>,
  runId: string,
  result: OptimizeResult,
): Promise<void> {
  const effective = result.effective;

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("runs")
      .set({
        status: "complete",
        completed_at: new Date(),
        elapsed_ms: result.elapsedMs,
        best_score: result.bestScore,
        optimize_history: toJsonb(
          result.history.map((point) => ({
            iteration: point.iteration,
            score: point.score,
          })),
        ),
        ...effectiveRunFields(effective),
      })
      .where("id", "=", runId)
      .execute();

    for (const candidate of result.top) {
      await trx
        .insertInto("run_candidates")
        .values({
          run_id: runId,
          rank: candidate.rank,
          score: candidate.score,
          counts: toJsonb(normalizeCounts(candidate.counts)),
          deck_hash: deckHash(normalizeCounts(candidate.counts)),
        })
        .execute();
    }
  });
}

export async function markRunFailed(
  db: Kysely<Database>,
  runId: string,
  message: string,
): Promise<void> {
  await db
    .updateTable("runs")
    .set({
      status: "failed",
      completed_at: new Date(),
      error_message: message,
    })
    .where("id", "=", runId)
    .execute();
}

export async function markRunCancelled(db: Kysely<Database>, runId: string): Promise<void> {
  await db
    .updateTable("runs")
    .set({
      status: "cancelled",
      completed_at: new Date(),
      error_message: "Cancelled by client",
    })
    .where("id", "=", runId)
    .execute();
}

export async function markRunRunning(db: Kysely<Database>, runId: string): Promise<void> {
  await db.updateTable("runs").set({ status: "running" }).where("id", "=", runId).execute();
}
