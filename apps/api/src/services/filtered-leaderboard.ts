import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { MATERIAL_CARD_IDS, isMaterialCardId } from "../db/card-seed.js";
import {
  computeAllHandImpacts,
  evaluateSamplesFromRows,
} from "../lib/hand-impact.js";
import type { VersionTriple } from "../lib/version.js";

function materialIdsFromRunBody(body: Record<string, unknown>): string[] {
  const materials = body.materials as Record<string, number> | undefined;
  if (!materials || Object.keys(materials).length === 0) {
    return [...MATERIAL_CARD_IDS];
  }
  return Object.entries(materials)
    .filter(([, qty]) => (qty ?? 0) > 0)
    .map(([id]) => id);
}

export type DamageBounds = {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
};

export function hasDamageBounds(bounds?: DamageBounds): boolean {
  if (!bounds) {
    return false;
  }
  return (
    bounds.gt != null ||
    bounds.gte != null ||
    bounds.lt != null ||
    bounds.lte != null
  );
}

export function damageInBounds(damage: number, bounds: DamageBounds): boolean {
  if (bounds.gt != null && !(damage > bounds.gt)) {
    return false;
  }
  if (bounds.gte != null && !(damage >= bounds.gte)) {
    return false;
  }
  if (bounds.lt != null && !(damage < bounds.lt)) {
    return false;
  }
  if (bounds.lte != null && !(damage <= bounds.lte)) {
    return false;
  }
  return true;
}

type CatalogName = { id: string; name: string };

/**
 * Bounded card leaderboard: SUM run_sample_card_stats for samples whose
 * damage is in bounds, weighted by occurrence_count. Does not load events.
 */
export async function cardLeaderboardFromSamples(
  db: Kysely<Database>,
  options: {
    deckHash: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    bounds: DamageBounds;
    cards: CatalogName[];
  },
) {
  const runs = await db
    .selectFrom("runs")
    .select(["id", "deck_counts", "samples", "request_body"])
    .where("status", "=", "complete")
    .where("kind", "=", "evaluate")
    .where("deck_hash", "=", options.deckHash)
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.version.rulesVersion)
    .where("sampler_version", "=", options.version.samplerVersion)
    .where("attribution_version", "=", options.attributionVersion)
    .orderBy("started_at", "asc")
    .execute();

  if (runs.length === 0) {
    return {
      runCount: 0,
      totalSamples: 0,
      version: options.version,
      attributionVersion: options.attributionVersion,
      deckHash: options.deckHash,
      simType: options.simType,
      cards: [],
    };
  }

  const runIds = runs.map((run) => run.id);
  let sampleQuery = db
    .selectFrom("run_samples")
    .select(["id", "run_id", "card_ids", "damage", "occurrence_count"])
    .where("run_id", "in", runIds);

  if (options.bounds.gt != null) {
    sampleQuery = sampleQuery.where("damage", ">", options.bounds.gt);
  }
  if (options.bounds.gte != null) {
    sampleQuery = sampleQuery.where("damage", ">=", options.bounds.gte);
  }
  if (options.bounds.lt != null) {
    sampleQuery = sampleQuery.where("damage", "<", options.bounds.lt);
  }
  if (options.bounds.lte != null) {
    sampleQuery = sampleQuery.where("damage", "<=", options.bounds.lte);
  }

  const samples = await sampleQuery.execute();
  if (samples.length === 0) {
    return {
      runCount: runs.length,
      totalSamples: 0,
      version: options.version,
      attributionVersion: options.attributionVersion,
      deckHash: options.deckHash,
      simType: options.simType,
      cards: [],
    };
  }

  const sampleIds = samples.map((sample) => sample.id);
  const weightBySample = new Map(
    samples.map((sample) => [sample.id, sample.occurrence_count]),
  );

  const statRows = await db
    .selectFrom("run_sample_card_stats")
    .select(["sample_id", "card_id", "plays", "attacks", "damage", "drawn"])
    .where("sample_id", "in", sampleIds)
    .execute();

  const runById = new Map(runs.map((run) => [run.id, run]));
  const deckCounts = (runs[0]?.deck_counts ?? {}) as Record<string, number>;
  type Acc = {
    copies: number;
    opened: number;
    openedCopies: number;
    drawn: number;
    seen: number;
    plays: number;
    attacks: number;
    damage: number;
    damageWhenSeenSum: number;
  };
  const emptyAcc = (): Acc => ({
    copies: 0,
    opened: 0,
    openedCopies: 0,
    drawn: 0,
    seen: 0,
    plays: 0,
    attacks: 0,
    damage: 0,
    damageWhenSeenSum: 0,
  });
  const acc = new Map<string, Acc>();
  for (const [cardId, copies] of Object.entries(deckCounts)) {
    if (cardId !== "brick" && !isMaterialCardId(cardId) && (copies ?? 0) > 0) {
      acc.set(cardId, {
        ...emptyAcc(),
        copies,
      });
    }
  }
  // Attribution 8+ emits one row per active material deck card across pooled runs.
  if (options.attributionVersion >= 8) {
    const materialIds = new Set<string>();
    for (const run of runs) {
      for (const cardId of materialIdsFromRunBody(
        run.request_body as Record<string, unknown>,
      )) {
        materialIds.add(cardId);
      }
    }
    for (const cardId of materialIds) {
      acc.set(cardId, { ...emptyAcc(), copies: 1 });
    }
  }

  let totalSamples = 0;
  const lineBySample = new Map<
    string,
    { plays: Record<string, number>; attacks: Record<string, number>; damage: Record<string, number>; drawn: Record<string, number> }
  >();
  for (const row of statRows) {
    let line = lineBySample.get(row.sample_id);
    if (!line) {
      line = { plays: {}, attacks: {}, damage: {}, drawn: {} };
      lineBySample.set(row.sample_id, line);
    }
    const weight = weightBySample.get(row.sample_id) ?? 1;
    line.plays[row.card_id] = (line.plays[row.card_id] ?? 0) + row.plays * weight;
    line.attacks[row.card_id] =
      (line.attacks[row.card_id] ?? 0) + row.attacks * weight;
    line.damage[row.card_id] =
      (line.damage[row.card_id] ?? 0) + row.damage * weight;
    line.drawn[row.card_id] = (line.drawn[row.card_id] ?? 0) + row.drawn * weight;
  }

  for (const sample of samples) {
    const weight = sample.occurrence_count;
    totalSamples += weight;
    const opening = sample.card_ids as string[];
    const line = lineBySample.get(sample.id) ?? {
      plays: {},
      attacks: {},
      damage: {},
      drawn: {},
    };
    const openedThis = new Set<string>();
    const seenThis = new Set<string>();
    for (const cardId of opening) {
      if (cardId === "brick" || isMaterialCardId(cardId)) continue;
      let row = acc.get(cardId);
      if (!row) {
        row = {
          ...emptyAcc(),
          copies: deckCounts[cardId] ?? 0,
        };
        acc.set(cardId, row);
      }
      openedThis.add(cardId);
      seenThis.add(cardId);
      row.openedCopies += weight;
    }
    const touched = new Set([
      ...openedThis,
      ...Object.keys(line.plays),
      ...Object.keys(line.attacks),
      ...Object.keys(line.damage),
      ...Object.keys(line.drawn),
    ]);
    for (const cardId of touched) {
      if (cardId === "brick" || isMaterialCardId(cardId)) continue;
      let row = acc.get(cardId);
      if (!row) {
        row = {
          ...emptyAcc(),
          copies: deckCounts[cardId] ?? 0,
        };
        acc.set(cardId, row);
      }
      if (openedThis.has(cardId)) {
        row.opened += weight;
      }
      const drawn = line.drawn[cardId] ?? 0;
      // drawn/plays already weighted when building lineBySample
      row.drawn += drawn;
      row.plays += line.plays[cardId] ?? 0;
      row.attacks += line.attacks[cardId] ?? 0;
      row.damage += line.damage[cardId] ?? 0;
      if (drawn > 0) {
        seenThis.add(cardId);
      }
      if (seenThis.has(cardId)) {
        row.seen += weight;
        row.damageWhenSeenSum += line.damage[cardId] ?? 0;
      }
    }
    const run = runById.get(sample.run_id);
    const materialIds = run
      ? materialIdsFromRunBody(run.request_body as Record<string, unknown>)
      : [...MATERIAL_CARD_IDS];
    for (const cardId of materialIds) {
      const row = acc.get(cardId);
      if (!row) continue;
      row.opened += weight;
      row.openedCopies += weight;
      row.seen += weight;
      row.plays += line.plays[cardId] ?? 0;
      row.attacks += line.attacks[cardId] ?? 0;
      row.damage += line.damage[cardId] ?? 0;
      row.damageWhenSeenSum += line.damage[cardId] ?? 0;
    }
  }

  const names = new Map(options.cards.map((card) => [card.id, card.name]));
  const handLiftByCard = computeAllHandImpacts(
    evaluateSamplesFromRows(
      samples.map((sample) => ({
        cardIds: sample.card_ids as string[],
        damage: sample.damage,
        occurrenceCount: sample.occurrence_count,
        deckCounts: deckCounts,
      })),
    ),
  );
  const rows = [...acc.entries()].filter(([, row]) => row.copies > 0);
  const totalDamage = rows.reduce((sum, [, row]) => sum + row.damage, 0);
  const cards = rows.map(([cardId, row]) => {
    const handAppearances = row.openedCopies + row.drawn;
    return {
      cardId,
      deckCopies: row.copies,
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
      damageWhenSeen: row.seen > 0 ? row.damageWhenSeenSum / row.seen : 0,
      damageShare: totalDamage > 0 ? row.damage / totalDamage : 0,
      handLift: handLiftByCard.get(cardId)?.handLift ?? null,
    };
  });
  cards.sort((a, b) => {
    if (b.damage !== a.damage) return b.damage - a.damage;
    if (b.plays !== a.plays) return b.plays - a.plays;
    return (names.get(a.cardId) ?? a.cardId).localeCompare(
      names.get(b.cardId) ?? b.cardId,
    );
  });

  return {
    runCount: runs.length,
    totalSamples,
    version: options.version,
    attributionVersion: options.attributionVersion,
    deckHash: options.deckHash,
    simType: options.simType,
    cards,
  };
}
