import type { Kysely } from "kysely";
import type {
  DeckEvalResult,
  EffectiveRequest,
  OptimizeResult,
} from "@ga-fire/contracts";
import type { Database } from "../db/types.js";
import { deckHash, damageHistogram, handHash, newId } from "../lib/deck.js";

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
  return {
    sim_type: effective.simType ?? null,
    root_seed: effective.rootSeed != null ? String(effective.rootSeed) : null,
    deck_counts: normalizeCounts(effective.deck ?? {}),
    go_first: effective.goFirst ?? null,
    max_turns: effective.maxTurns ?? null,
    rollouts: effective.rollouts ?? null,
    samples: effective.samples ?? null,
    budget: effective.budget ?? null,
    metric: effective.metric ?? null,
    bounds: (effective.bounds ?? null) as Record<string, { min: number; max: number }> | null,
    deck_size: effective.deckSize ?? null,
    decks_requested: effective.decks ?? null,
    deck_hash: deckHash(normalizeCounts(effective.deck ?? {})),
    ...effectiveVersionFields(effective),
  };
}

export async function persistEvaluateResult(
  db: Kysely<Database>,
  runId: string,
  result: DeckEvalResult,
): Promise<void> {
  const effective = result.effective;
  const handGroups = new Map<string, { cardIds: string[]; damage: number; nodes: string; steps: unknown[] | null; count: number }>();

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
      steps: hand.steps ?? null,
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
        p50_damage: result.p50,
        p90_damage: result.p90,
        max_damage: result.max,
        min_damage: result.min,
        damage_histogram: damageHistogram(result.damages),
        ...effectiveRunFields(effective),
      })
      .where("id", "=", runId)
      .execute();

    for (const [hash, sample] of handGroups) {
      await trx
        .insertInto("run_samples")
        .values({
          id: newId(),
          run_id: runId,
          hand_hash: hash,
          card_ids: sample.cardIds,
          occurrence_count: sample.count,
          damage: sample.damage,
          nodes: sample.nodes,
          steps: sample.steps,
        })
        .execute();
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
        optimize_history: result.history.map((point) => ({
          iteration: point.iteration,
          score: point.score,
        })),
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
          counts: normalizeCounts(candidate.counts) as Record<string, number>,
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
