import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types.js";
import type { VersionTriple } from "../lib/version.js";
import { isMaterialCardId } from "../db/card-seed.js";
import { getCards, listDecksForCard, type CatalogCard } from "./card-catalog.js";

const COMPLETE = "complete" as const;

export type CardPerformance = {
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
  openRate: number;
  seeRate: number;
  playWhenInHand: number;
  damageWhenSeen: number;
  withHandMean: number | null;
  withoutHandMean: number | null;
  handLift: number | null;
  withHandSamples: number;
  withoutHandSamples: number;
};

export type CardDatabaseCard = CatalogCard & {
  performance: CardPerformance | null;
  hasOlderData: boolean;
};

export type CardDatabaseContributor = {
  deckId: string;
  name: string;
  runCount: number;
  samples: number;
  sampleShare: number;
};

export type CardDatabaseDeckRow = {
  deckId: string;
  name: string;
  copies: number | null;
  runCount: number;
  samples: number;
  damageWhenSeen: number | null;
  withHandMean: number | null;
  withoutHandMean: number | null;
  handLift: number | null;
  withHandSamples: number;
  withoutHandSamples: number;
};

export type CardHandImpact = {
  withHandMean: number | null;
  withoutHandMean: number | null;
  handLift: number | null;
  withHandSamples: number;
  withoutHandSamples: number;
};

function ratesFromTotals(row: {
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
}): CardPerformance {
  const eligibleSamples = row.eligibleSamples;
  const handAppearances = row.openedCopies + row.drawn;
  const seen = row.seen;
  return mergeHandImpact(
    {
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
      withHandMean: null,
      withoutHandMean: null,
      handLift: null,
      withHandSamples: 0,
      withoutHandSamples: 0,
    },
    undefined,
  );
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

function mergeHandImpact(
  base: CardPerformance,
  impact: CardHandImpact | undefined,
): CardPerformance {
  return {
    ...base,
    withHandMean: impact?.withHandMean ?? null,
    withoutHandMean: impact?.withoutHandMean ?? null,
    handLift: impact?.handLift ?? null,
    withHandSamples: impact?.withHandSamples ?? 0,
    withoutHandSamples: impact?.withoutHandSamples ?? 0,
  };
}

export async function cardDatabase(
  db: Kysely<Database>,
  options: {
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    currentVersion: VersionTriple;
    currentAttributionVersion: number;
    deckIds?: string[];
  },
) {
  const catalog = await getCards(db);
  const deckIds = options.deckIds?.filter(Boolean);

  const contributorRows = await db
    .selectFrom("runs as r")
    .innerJoin("decks as d", "d.id", "r.deck_id")
    .select([
      "r.deck_id as deckId",
      "d.name as name",
      sql<number>`count(*)::int`.as("runCount"),
      sql<number>`sum(coalesce(r.samples, 0))::int`.as("samples"),
    ])
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.currentVersion.rulesVersion)
    .where("r.sampler_version", "=", options.currentVersion.samplerVersion)
    .where("r.card_digest", "=", options.currentVersion.cardDigest)
    .where("r.attribution_version", "=", options.currentAttributionVersion)
    .groupBy(["r.deck_id", "d.name"])
    .orderBy(sql`sum(coalesce(r.samples, 0))`, "desc")
    .execute();

  const totalContributorSamples = contributorRows.reduce(
    (sum, row) => sum + row.samples,
    0,
  );
  const contributors: CardDatabaseContributor[] = contributorRows.map(
    (row) => ({
      deckId: row.deckId!,
      name: row.name,
      runCount: row.runCount,
      samples: row.samples,
      sampleShare:
        totalContributorSamples > 0 ? row.samples / totalContributorSamples : 0,
    }),
  );

  const emptyDeckFilter = deckIds !== undefined && deckIds.length === 0;

  let performanceByCard = new Map<string, CardPerformance>();
  let olderSet = new Set<string>();
  let totalRuns = 0;
  let totalSamples = 0;

  if (!emptyDeckFilter) {
    let statsQuery = db
      .selectFrom("run_card_stats as cs")
      .innerJoin("runs as r", "r.id", "cs.run_id")
      .select([
        "cs.card_id as cardId",
        sql<number>`count(distinct r.id)::int`.as("runCount"),
        sql<number>`count(distinct r.deck_id)::int`.as("deckCount"),
        sql<number>`sum(coalesce(r.samples, 0))::int`.as("eligibleSamples"),
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
      .where("r.deck_id", "is not", null)
      .where("r.sim_type", "=", options.simType)
      .where("r.rules_version", "=", options.version.rulesVersion)
      .where("r.sampler_version", "=", options.version.samplerVersion)
      .where("r.card_digest", "=", options.version.cardDigest)
      .where("r.attribution_version", "=", options.attributionVersion)
      .groupBy("cs.card_id");

    if (deckIds && deckIds.length > 0) {
      statsQuery = statsQuery.where("r.deck_id", "in", deckIds);
    }

    const statRows = await statsQuery.execute();
    const samples = await loadEvaluateSamples(db, {
      simType: options.simType,
      version: options.version,
      attributionVersion: options.attributionVersion,
      deckIds,
    });
    const handImpactByCard = computeAllHandImpacts(samples);
    performanceByCard = new Map(
      statRows.map((row) => {
        const impact = handImpactByCard.get(row.cardId);
        return [
          row.cardId,
          mergeHandImpact(ratesFromTotals(row), impact),
        ];
      }),
    );
    for (const [cardId, impact] of handImpactByCard) {
      if (performanceByCard.has(cardId) || impact.handLift == null) {
        continue;
      }
      performanceByCard.set(cardId, mergeHandImpact(emptyPerformance(), impact));
    }

    let olderQuery = db
      .selectFrom("run_card_stats as cs")
      .innerJoin("runs as r", "r.id", "cs.run_id")
      .select("cs.card_id as cardId")
      .distinct()
      .where("r.status", "=", COMPLETE)
      .where("r.kind", "=", "evaluate")
      .where("r.deck_id", "is not", null)
      .where("r.sim_type", "=", options.simType)
      .where((eb) =>
        eb.or([
          eb("r.rules_version", "<>", options.currentVersion.rulesVersion),
          eb("r.sampler_version", "<>", options.currentVersion.samplerVersion),
          eb("r.card_digest", "<>", options.currentVersion.cardDigest),
          eb(
            "r.attribution_version",
            "<>",
            options.currentAttributionVersion,
          ),
        ]),
      );

    if (deckIds && deckIds.length > 0) {
      olderQuery = olderQuery.where("r.deck_id", "in", deckIds);
    }

    const olderRows = await olderQuery.execute();
    olderSet = new Set(olderRows.map((row) => row.cardId));

    let runCountQuery = db
      .selectFrom("runs")
      .select(sql<number>`count(*)::int`.as("runCount"))
      .where("status", "=", COMPLETE)
      .where("kind", "=", "evaluate")
      .where("deck_id", "is not", null)
      .where("sim_type", "=", options.simType)
      .where("rules_version", "=", options.version.rulesVersion)
      .where("sampler_version", "=", options.version.samplerVersion)
      .where("card_digest", "=", options.version.cardDigest)
      .where("attribution_version", "=", options.attributionVersion);

    let samplesQuery = db
      .selectFrom("runs")
      .select(sql<number>`sum(coalesce(samples, 0))::int`.as("totalSamples"))
      .where("status", "=", COMPLETE)
      .where("kind", "=", "evaluate")
      .where("deck_id", "is not", null)
      .where("sim_type", "=", options.simType)
      .where("rules_version", "=", options.version.rulesVersion)
      .where("sampler_version", "=", options.version.samplerVersion)
      .where("card_digest", "=", options.version.cardDigest)
      .where("attribution_version", "=", options.attributionVersion);

    if (deckIds && deckIds.length > 0) {
      runCountQuery = runCountQuery.where("deck_id", "in", deckIds);
      samplesQuery = samplesQuery.where("deck_id", "in", deckIds);
    }

    const [runCountRow, samplesRow] = await Promise.all([
      runCountQuery.executeTakeFirst(),
      samplesQuery.executeTakeFirst(),
    ]);
    totalRuns = runCountRow?.runCount ?? 0;
    totalSamples = samplesRow?.totalSamples ?? 0;
  }

  const cards: CardDatabaseCard[] = catalog
    .filter((card) => card.kind !== "brick" && card.id !== "brick")
    .map((card) => {
      const performance = performanceByCard.get(card.id) ?? null;
      const hasData =
        performance != null &&
        (performance.handLift != null || performance.eligibleSamples > 0);
      return {
        ...card,
        performance: hasData ? performance : null,
        hasOlderData: olderSet.has(card.id),
      };
    });

  cards.sort((a, b) => {
    const aLift = a.performance?.handLift ?? -Infinity;
    const bLift = b.performance?.handLift ?? -Infinity;
    if (bLift !== aLift) return bLift - aLift;
    return a.name.localeCompare(b.name);
  });

  return {
    simType: options.simType,
    version: options.version,
    attributionVersion: options.attributionVersion,
    currentVersion: options.currentVersion,
    currentAttributionVersion: options.currentAttributionVersion,
    totalRuns,
    totalSamples,
    contributors,
    cards,
  };
}

async function evaluateDecksForCard(
  db: Kysely<Database>,
  options: {
    cardId: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckIds?: string[];
  },
) {
  if (options.deckIds !== undefined && options.deckIds.length === 0) {
    return [];
  }

  let deckQuery = db
    .selectFrom("run_card_stats as cs")
    .innerJoin("runs as r", "r.id", "cs.run_id")
    .innerJoin("decks as d", "d.id", "r.deck_id")
    .select([
      "r.deck_id as deckId",
      "d.name as name",
      sql<number>`count(distinct r.id)::int`.as("runCount"),
      sql<number>`sum(coalesce(r.samples, 0))::int`.as("samples"),
      sql<number>`sum(cs.seen)::int`.as("seen"),
      sql<number>`sum(cs.damage_when_seen_sum)::int`.as("damageWhenSeenSum"),
    ])
    .where("cs.card_id", "=", options.cardId)
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.card_digest", "=", options.version.cardDigest)
    .where("r.attribution_version", "=", options.attributionVersion)
    .groupBy(["r.deck_id", "d.name"])
    .orderBy(sql`sum(coalesce(r.samples, 0))`, "desc");

  if (options.deckIds && options.deckIds.length > 0) {
    deckQuery = deckQuery.where("r.deck_id", "in", options.deckIds);
  }

  const decks = await deckQuery.execute();
  return decks.map((row) => ({
    deckId: row.deckId!,
    name: row.name,
    runCount: row.runCount,
    samples: row.samples,
    damageWhenSeen: row.seen > 0 ? row.damageWhenSeenSum / row.seen : 0,
  }));
}

/** Decklist membership first; evaluate stats attached when present. */
export async function cardDatabaseCardDecks(
  db: Kysely<Database>,
  options: {
    cardId: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckIds?: string[];
  },
): Promise<CardDatabaseDeckRow[]> {
  const stats = await evaluateDecksForCard(db, options);
  const statsById = new Map(stats.map((row) => [row.deckId, row]));
  const samples = await loadEvaluateSamples(db, {
    simType: options.simType,
    version: options.version,
    attributionVersion: options.attributionVersion,
    deckIds: options.deckIds,
  });

  function deckRow(
    deckId: string,
    name: string,
    copies: number | null,
    stat?: (typeof stats)[number],
  ): CardDatabaseDeckRow {
    const impact = computeHandImpact(samples, options.cardId, deckId);
    return {
      deckId,
      name,
      copies,
      runCount: stat?.runCount ?? 0,
      samples: stat?.samples ?? 0,
      damageWhenSeen: stat?.damageWhenSeen ?? null,
      withHandMean: impact.withHandMean,
      withoutHandMean: impact.withoutHandMean,
      handLift: impact.handLift,
      withHandSamples: impact.withHandSamples,
      withoutHandSamples: impact.withoutHandSamples,
    };
  }

  if (isMaterialCardId(options.cardId)) {
    return stats.map((row) =>
      deckRow(row.deckId, row.name, null, row),
    );
  }

  let membership = await listDecksForCard(db, options.cardId);
  if (options.deckIds !== undefined) {
    const allow = new Set(options.deckIds);
    membership = membership.filter((deck) => allow.has(deck.id));
  }

  const fromMembership: CardDatabaseDeckRow[] = membership.map((deck) =>
    deckRow(deck.id, deck.name, deck.copies, statsById.get(deck.id)),
  );

  const seen = new Set(fromMembership.map((row) => row.deckId));
  const extras: CardDatabaseDeckRow[] = stats
    .filter((row) => !seen.has(row.deckId))
    .map((row) => deckRow(row.deckId, row.name, null, row));

  return [...fromMembership, ...extras];
}

/** Materialize / level kinds that count as "playing" a material card. */
const MATERIAL_PLAY_KINDS: Record<string, string[]> = {
  impact_hammer: ["materializeHammer"],
  poisoned_dagger: ["materializeDagger"],
  varuckan_soulknife: ["materializeSoulknife"],
  mercenary_blade: ["materializeBlade"],
  zander_1: ["floatForZander", "levelZander"],
};

export type CardPlayMatrixCell = {
  turn: number;
  phase: string;
  plays: number;
  shareOfPlays: number;
  perSample: number;
};

export type CardPlayMatrix = {
  totalPlays: number;
  totalSamples: number;
  cells: CardPlayMatrixCell[];
};

/** Occurrence-weighted play counts by turn × phase from stored line events. */
export async function cardDatabasePlayMatrix(
  db: Kysely<Database>,
  options: {
    cardId: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckIds?: string[];
  },
): Promise<CardPlayMatrix> {
  if (options.deckIds !== undefined && options.deckIds.length === 0) {
    return { totalPlays: 0, totalSamples: 0, cells: [] };
  }

  const materialKinds = MATERIAL_PLAY_KINDS[options.cardId];

  let sampleQuery = db
    .selectFrom("run_samples as rs")
    .innerJoin("runs as r", "r.id", "rs.run_id")
    .select(sql<number>`coalesce(sum(rs.occurrence_count), 0)::int`.as("totalSamples"))
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.card_digest", "=", options.version.cardDigest)
    .where("r.attribution_version", "=", options.attributionVersion);

  if (options.deckIds && options.deckIds.length > 0) {
    sampleQuery = sampleQuery.where("r.deck_id", "in", options.deckIds);
  }

  const sampleRow = await sampleQuery.executeTakeFirst();
  const totalSamples = sampleRow?.totalSamples ?? 0;
  if (totalSamples === 0) {
    return { totalPlays: 0, totalSamples: 0, cells: [] };
  }

  let playQuery = db
    .selectFrom("run_sample_events as e")
    .innerJoin("run_samples as rs", "rs.id", "e.sample_id")
    .innerJoin("runs as r", "r.id", "rs.run_id")
    .select([
      sql<number>`(e.payload->>'turn')::int`.as("turn"),
      sql<string>`e.payload->>'phase'`.as("phase"),
      sql<number>`sum(rs.occurrence_count)::int`.as("plays"),
    ])
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.card_digest", "=", options.version.cardDigest)
    .where("r.attribution_version", "=", options.attributionVersion)
    .groupBy([
      sql`(e.payload->>'turn')::int`,
      sql`e.payload->>'phase'`,
    ])
    .orderBy(sql`(e.payload->>'turn')::int`, "asc")
    .orderBy(sql`e.payload->>'phase'`, "asc");

  if (options.deckIds && options.deckIds.length > 0) {
    playQuery = playQuery.where("r.deck_id", "in", options.deckIds);
  }

  if (materialKinds) {
    playQuery = playQuery.where("e.kind", "in", materialKinds);
  } else {
    playQuery = playQuery
      .where("e.kind", "=", "play")
      .where("e.card_id", "=", options.cardId);
  }

  const rows = (await playQuery.execute()).filter(
    (row) => row.phase != null && row.turn != null && Number.isFinite(row.turn),
  );
  const totalPlays = rows.reduce((sum, row) => sum + row.plays, 0);
  const cells: CardPlayMatrixCell[] = rows.map((row) => ({
    turn: row.turn,
    phase: row.phase,
    plays: row.plays,
    shareOfPlays: totalPlays > 0 ? row.plays / totalPlays : 0,
    perSample: totalSamples > 0 ? row.plays / totalSamples : 0,
  }));

  return { totalPlays, totalSamples, cells };
}

const MIN_HAND_BUCKET_SAMPLES = 5;

type WeightedDamage = { damage: number; weight: number };

type EvaluateSample = {
  hand: Set<string>;
  damage: number;
  weight: number;
  deckCards: Set<string>;
  deckId: string | null;
};

function deckCardSet(counts: Record<string, number>): Set<string> {
  const set = new Set<string>();
  for (const [cardId, copies] of Object.entries(counts)) {
    if (typeof copies === "number" && copies > 0) {
      set.add(cardId);
    }
  }
  return set;
}

function weightedMean(entries: WeightedDamage[]): number | null {
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

function weightedCount(entries: WeightedDamage[]): number {
  return entries.reduce((sum, entry) => sum + entry.weight, 0);
}

function openingHandSet(cardIds: string[]): Set<string> {
  return new Set(cardIds);
}

async function loadEvaluateSamples(
  db: Kysely<Database>,
  options: {
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckIds?: string[];
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
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.card_digest", "=", options.version.cardDigest)
    .where("r.attribution_version", "=", options.attributionVersion);

  if (options.deckIds && options.deckIds.length > 0) {
    query = query.where("r.deck_id", "in", options.deckIds);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    hand: openingHandSet(row.cardIds),
    damage: row.damage,
    weight: row.occurrenceCount,
    deckCards: deckCardSet(row.deckCounts ?? {}),
    deckId: row.deckId,
  }));
}

function finalizeHandImpact(
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

function computeHandImpact(
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

function computeAllHandImpacts(
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

export type CardDatabasePairingRow = {
  cardId: string;
  name: string;
  bothMean: number;
  selectedWithoutPartnerMean: number;
  partnerWithoutSelectedMean: number;
  pairsWithMeDelta: number;
  dependsOnMeDelta: number;
  bothCount: number;
  selectedWithoutPartnerCount: number;
  partnerWithoutSelectedCount: number;
};

export type CardDatabasePairings = {
  cardId: string;
  totalSamples: number;
  partners: CardDatabasePairingRow[];
};

/** Opening-hand co-presence means for card partner analysis. */
export async function cardDatabasePairings(
  db: Kysely<Database>,
  options: {
    cardId: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckIds?: string[];
  },
): Promise<CardDatabasePairings> {
  const empty: CardDatabasePairings = {
    cardId: options.cardId,
    totalSamples: 0,
    partners: [],
  };

  if (
    options.deckIds !== undefined &&
    options.deckIds.length === 0
  ) {
    return empty;
  }

  if (isMaterialCardId(options.cardId)) {
    return empty;
  }

  let sampleQuery = db
    .selectFrom("run_samples as rs")
    .innerJoin("runs as r", "r.id", "rs.run_id")
    .select([
      "rs.card_ids as cardIds",
      "rs.damage as damage",
      "rs.occurrence_count as occurrenceCount",
      "r.deck_counts as deckCounts",
      "r.deck_id as deckId",
    ])
    .where("r.status", "=", COMPLETE)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.card_digest", "=", options.version.cardDigest)
    .where("r.attribution_version", "=", options.attributionVersion);

  if (options.deckIds && options.deckIds.length > 0) {
    sampleQuery = sampleQuery.where("r.deck_id", "in", options.deckIds);
  }

  const sampleRows = await sampleQuery.execute();
  const totalSamples = sampleRows.reduce(
    (sum, row) => sum + row.occurrenceCount,
    0,
  );
  if (totalSamples === 0) {
    return empty;
  }

  const catalog = await getCards(db);
  const nameById = new Map(catalog.map((card) => [card.id, card.name]));

  const samples: EvaluateSample[] = sampleRows.map((row) => ({
    hand: openingHandSet(row.cardIds),
    damage: row.damage,
    weight: row.occurrenceCount,
    deckCards: deckCardSet(row.deckCounts ?? {}),
    deckId: row.deckId,
  }));

  const selectedId = options.cardId;
  const partners = new Set<string>();
  for (const sample of samples) {
    for (const cardId of sample.hand) {
      if (cardId === selectedId || isMaterialCardId(cardId)) {
        continue;
      }
      partners.add(cardId);
    }
  }

  const rows: CardDatabasePairingRow[] = [];
  for (const partnerId of partners) {
    const both: WeightedDamage[] = [];
    const selectedWithoutPartner: WeightedDamage[] = [];
    const partnerWithoutSelected: WeightedDamage[] = [];

    for (const sample of samples) {
      const hasSelected = sample.hand.has(selectedId);
      const hasPartner = sample.hand.has(partnerId);
      const entry = { damage: sample.damage, weight: sample.weight };
      if (hasSelected && hasPartner) {
        both.push(entry);
      } else if (hasSelected && !hasPartner) {
        selectedWithoutPartner.push(entry);
      } else if (!hasSelected && hasPartner) {
        partnerWithoutSelected.push(entry);
      }
    }

    if (
      weightedCount(both) < MIN_HAND_BUCKET_SAMPLES ||
      weightedCount(selectedWithoutPartner) < MIN_HAND_BUCKET_SAMPLES ||
      weightedCount(partnerWithoutSelected) < MIN_HAND_BUCKET_SAMPLES
    ) {
      continue;
    }

    const bothMean = weightedMean(both);
    const selectedWithoutPartnerMean = weightedMean(selectedWithoutPartner);
    const partnerWithoutSelectedMean = weightedMean(partnerWithoutSelected);
    if (
      bothMean == null ||
      selectedWithoutPartnerMean == null ||
      partnerWithoutSelectedMean == null
    ) {
      continue;
    }

    rows.push({
      cardId: partnerId,
      name: nameById.get(partnerId) ?? partnerId,
      bothMean,
      selectedWithoutPartnerMean,
      partnerWithoutSelectedMean,
      pairsWithMeDelta: bothMean - selectedWithoutPartnerMean,
      dependsOnMeDelta: bothMean - partnerWithoutSelectedMean,
      bothCount: weightedCount(both),
      selectedWithoutPartnerCount: weightedCount(selectedWithoutPartner),
      partnerWithoutSelectedCount: weightedCount(partnerWithoutSelected),
    });
  }

  rows.sort((a, b) => b.pairsWithMeDelta - a.pairsWithMeDelta);

  return {
    cardId: selectedId,
    totalSamples,
    partners: rows,
  };
}
