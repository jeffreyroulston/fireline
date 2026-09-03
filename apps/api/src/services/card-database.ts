import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types.js";
import type { VersionTriple } from "../lib/version.js";
import {
  type CardHandImpact,
  type EvaluateSample,
  type WeightedDamage,
  MIN_HAND_BUCKET_SAMPLES,
  computeAllHandImpacts,
  computeHandImpact,
  deckCardSet,
  loadEvaluateSamples,
  openingHandSet,
  weightedCount,
  weightedMean,
} from "../lib/hand-impact.js";
import { isMaterialCardId } from "../db/card-seed.js";
import { getCards, listDecksForCard, type CatalogCard } from "./card-catalog.js";
import {
  loadSwapSweepCardDeckRows,
  loadSwapSweepSlice,
  parseSwapSweepVirtualDeckId,
} from "./card-database-swap-sweep.js";
import {
  applyRunSettingsFilter,
  loadAvailableRunSettings,
  type AvailableRunSettings,
  type RunSettingsFilter,
} from "../lib/run-settings-filter.js";

export type { AvailableRunSettings, RunSettingsFilter } from "../lib/run-settings-filter.js";

export type { CardHandImpact } from "../lib/hand-impact.js";

const DONE_STATUSES = ["complete", "partial"] as const;

export type CardDatabaseSource = "all" | "evaluate" | "swap_sweep";

export function includesEvaluate(source: CardDatabaseSource): boolean {
  return source === "all" || source === "evaluate";
}

export function includesSwapSweep(source: CardDatabaseSource): boolean {
  return source === "all" || source === "swap_sweep";
}

function splitCardDatabaseDeckIds(
  source: CardDatabaseSource,
  deckIds: string[] | undefined,
): {
  evaluateDeckIds: string[] | undefined;
  swapSweepDeckIds: string[] | undefined;
} {
  if (deckIds === undefined) {
    return { evaluateDeckIds: undefined, swapSweepDeckIds: undefined };
  }

  const evaluateDeckIds: string[] = [];
  const swapSweepDeckIds: string[] = [];
  for (const id of deckIds) {
    const original = parseSwapSweepVirtualDeckId(id);
    if (original) {
      swapSweepDeckIds.push(original);
    } else {
      evaluateDeckIds.push(id);
      if (source === "swap_sweep") {
        swapSweepDeckIds.push(id);
      }
    }
  }

  return {
    evaluateDeckIds: includesEvaluate(source) ? evaluateDeckIds : [],
    swapSweepDeckIds: includesSwapSweep(source) ? swapSweepDeckIds : [],
  };
}

function includeDeckScopedQuery(deckIds: string[] | undefined): boolean {
  return deckIds === undefined || deckIds.length > 0;
}

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

function mergePerformance(
  a: CardPerformance,
  b: CardPerformance,
): CardPerformance {
  const totals = {
    runCount: a.runCount + b.runCount,
    deckCount: a.deckCount + b.deckCount,
    eligibleSamples: a.eligibleSamples + b.eligibleSamples,
    opened: a.opened + b.opened,
    openedCopies: a.openedCopies + b.openedCopies,
    drawn: a.drawn + b.drawn,
    seen: a.seen + b.seen,
    plays: a.plays + b.plays,
    attacks: a.attacks + b.attacks,
    damage: a.damage + b.damage,
    damageWhenSeenSum:
      a.damageWhenSeen * a.seen + b.damageWhenSeen * b.seen,
  };
  const liftSource = a.handLift != null ? a : b;
  return mergeHandImpact(ratesFromTotals(totals), {
    withHandMean: liftSource.withHandMean,
    withoutHandMean: liftSource.withoutHandMean,
    handLift: liftSource.handLift,
    withHandSamples: liftSource.withHandSamples,
    withoutHandSamples: liftSource.withoutHandSamples,
  });
}

function mergePerformanceMaps(
  a: Map<string, CardPerformance>,
  b: Map<string, CardPerformance>,
): Map<string, CardPerformance> {
  const merged = new Map(a);
  for (const [cardId, extra] of b) {
    const existing = merged.get(cardId);
    merged.set(cardId, existing ? mergePerformance(existing, extra) : extra);
  }
  return merged;
}

function mergeContributors(
  a: CardDatabaseContributor[],
  b: CardDatabaseContributor[],
): CardDatabaseContributor[] {
  const byDeck = new Map<string, CardDatabaseContributor>();
  for (const row of [...a, ...b]) {
    const existing = byDeck.get(row.deckId);
    if (!existing) {
      byDeck.set(row.deckId, { ...row });
      continue;
    }
    existing.runCount += row.runCount;
    existing.samples += row.samples;
  }
  const merged = [...byDeck.values()];
  const totalSamples = merged.reduce((sum, row) => sum + row.samples, 0);
  for (const row of merged) {
    row.sampleShare = totalSamples > 0 ? row.samples / totalSamples : 0;
  }
  merged.sort((left, right) => right.samples - left.samples);
  return merged;
}

function mergeDeckRows(
  a: CardDatabaseDeckRow[],
  b: CardDatabaseDeckRow[],
): CardDatabaseDeckRow[] {
  const byDeck = new Map<string, CardDatabaseDeckRow>();
  for (const row of [...a, ...b]) {
    const existing = byDeck.get(row.deckId);
    if (!existing) {
      byDeck.set(row.deckId, { ...row });
      continue;
    }
    const seenA = existing.damageWhenSeen != null ? existing.samples : 0;
    const seenB = row.damageWhenSeen != null ? row.samples : 0;
    byDeck.set(row.deckId, {
      deckId: existing.deckId,
      name: existing.name,
      copies: existing.copies ?? row.copies,
      runCount: existing.runCount + row.runCount,
      samples: existing.samples + row.samples,
      damageWhenSeen:
        existing.damageWhenSeen != null && row.damageWhenSeen != null
          ? (existing.damageWhenSeen * seenA + row.damageWhenSeen * seenB) /
            Math.max(seenA + seenB, 1)
          : (existing.damageWhenSeen ?? row.damageWhenSeen),
      withHandMean: existing.withHandMean ?? row.withHandMean,
      withoutHandMean: existing.withoutHandMean ?? row.withoutHandMean,
      handLift: existing.handLift ?? row.handLift,
      withHandSamples: existing.withHandSamples || row.withHandSamples,
      withoutHandSamples: existing.withoutHandSamples || row.withoutHandSamples,
    });
  }
  return [...byDeck.values()].sort((left, right) => right.samples - left.samples);
}

export async function cardDatabase(
  db: Kysely<Database>,
  options: {
    source?: CardDatabaseSource;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    currentVersion: VersionTriple;
    currentAttributionVersion: number;
    deckIds?: string[];
    runSettings?: RunSettingsFilter;
  },
) {
  const source = options.source ?? "evaluate";
  const catalog = await getCards(db);
  const deckIds = options.deckIds?.filter(Boolean);
  const skipAll = deckIds !== undefined && deckIds.length === 0;
  const { evaluateDeckIds, swapSweepDeckIds } = splitCardDatabaseDeckIds(
    source,
    deckIds,
  );
  const swapQuery = {
    simType: options.simType,
    version: options.version,
    attributionVersion: options.attributionVersion,
    currentVersion: options.currentVersion,
    currentAttributionVersion: options.currentAttributionVersion,
    deckIds: swapSweepDeckIds,
    runSettings: options.runSettings,
  };

  let contributors: CardDatabaseContributor[] = [];
  let performanceByCard = new Map<string, CardPerformance>();
  let olderSet = new Set<string>();
  let totalRuns = 0;
  let totalSamples = 0;

  if (includesEvaluate(source) && !skipAll) {
    let contributorQuery = db
      .selectFrom("runs as r")
      .innerJoin("decks as d", "d.id", "r.deck_id")
      .select([
        "r.deck_id as deckId",
        "d.name as name",
        sql<number>`count(*)::int`.as("runCount"),
        sql<number>`sum(coalesce(r.samples, 0))::int`.as("samples"),
      ])
      .where("r.status", "in", DONE_STATUSES)
      .where("r.kind", "=", "evaluate")
      .where("r.deck_id", "is not", null)
      .where("r.sim_type", "=", options.simType)
      .where("r.rules_version", "=", options.currentVersion.rulesVersion)
      .where("r.sampler_version", "=", options.currentVersion.samplerVersion)
      .where("r.attribution_version", "=", options.currentAttributionVersion);

    contributorQuery = applyRunSettingsFilter(
      contributorQuery,
      options.runSettings,
      "r",
    );

    const contributorRows = await contributorQuery
      .groupBy(["r.deck_id", "d.name"])
      .orderBy(sql`sum(coalesce(r.samples, 0))`, "desc")
      .execute();

    const totalContributorSamples = contributorRows.reduce(
      (sum, row) => sum + row.samples,
      0,
    );
    contributors = contributorRows.map((row) => ({
      deckId: row.deckId!,
      name: row.name,
      runCount: row.runCount,
      samples: row.samples,
      sampleShare:
        totalContributorSamples > 0
          ? row.samples / totalContributorSamples
          : 0,
    }));

    if (includeDeckScopedQuery(evaluateDeckIds)) {
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
        .where("r.status", "in", DONE_STATUSES)
        .where("r.kind", "=", "evaluate")
        .where("r.deck_id", "is not", null)
        .where("r.sim_type", "=", options.simType)
        .where("r.rules_version", "=", options.version.rulesVersion)
        .where("r.sampler_version", "=", options.version.samplerVersion)
        .where("r.attribution_version", "=", options.attributionVersion)
        .groupBy("cs.card_id");

      if (evaluateDeckIds && evaluateDeckIds.length > 0) {
        statsQuery = statsQuery.where("r.deck_id", "in", evaluateDeckIds);
      }

      statsQuery = applyRunSettingsFilter(statsQuery, options.runSettings, "r");

      const statRows = await statsQuery.execute();
      const samples = await loadEvaluateSamples(db, {
        simType: options.simType,
        version: options.version,
        attributionVersion: options.attributionVersion,
        deckIds: evaluateDeckIds,
        runSettings: options.runSettings,
      });
      const handImpactByCard = computeAllHandImpacts(samples);
      performanceByCard = new Map(
        statRows.map((row) => {
          const impact = handImpactByCard.get(row.cardId);
          return [row.cardId, mergeHandImpact(ratesFromTotals(row), impact)];
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
        .where("r.status", "in", DONE_STATUSES)
        .where("r.kind", "=", "evaluate")
        .where("r.deck_id", "is not", null)
        .where("r.sim_type", "=", options.simType)
        .where((eb) =>
          eb.or([
            eb("r.rules_version", "<>", options.currentVersion.rulesVersion),
            eb("r.sampler_version", "<>", options.currentVersion.samplerVersion),
            eb(
              "r.attribution_version",
              "<>",
              options.currentAttributionVersion,
            ),
          ]),
        );

      if (evaluateDeckIds && evaluateDeckIds.length > 0) {
        olderQuery = olderQuery.where("r.deck_id", "in", evaluateDeckIds);
      }

      olderQuery = applyRunSettingsFilter(olderQuery, options.runSettings, "r");

      const olderRows = await olderQuery.execute();
      olderSet = new Set(olderRows.map((row) => row.cardId));

      let runCountQuery = db
        .selectFrom("runs")
        .select(sql<number>`count(*)::int`.as("runCount"))
        .where("status", "in", DONE_STATUSES)
        .where("kind", "=", "evaluate")
        .where("deck_id", "is not", null)
        .where("sim_type", "=", options.simType)
        .where("rules_version", "=", options.version.rulesVersion)
        .where("sampler_version", "=", options.version.samplerVersion)
        .where("attribution_version", "=", options.attributionVersion);

      let samplesQuery = db
        .selectFrom("runs")
        .select(sql<number>`sum(coalesce(samples, 0))::int`.as("totalSamples"))
        .where("status", "in", DONE_STATUSES)
        .where("kind", "=", "evaluate")
        .where("deck_id", "is not", null)
        .where("sim_type", "=", options.simType)
        .where("rules_version", "=", options.version.rulesVersion)
        .where("sampler_version", "=", options.version.samplerVersion)
        .where("attribution_version", "=", options.attributionVersion);

      if (evaluateDeckIds && evaluateDeckIds.length > 0) {
        runCountQuery = runCountQuery.where("deck_id", "in", evaluateDeckIds);
        samplesQuery = samplesQuery.where("deck_id", "in", evaluateDeckIds);
      }

      runCountQuery = applyRunSettingsFilter(
        runCountQuery,
        options.runSettings,
      );
      samplesQuery = applyRunSettingsFilter(
        samplesQuery,
        options.runSettings,
      );

      const [runCountRow, samplesRow] = await Promise.all([
        runCountQuery.executeTakeFirst(),
        samplesQuery.executeTakeFirst(),
      ]);
      totalRuns = runCountRow?.runCount ?? 0;
      totalSamples = samplesRow?.totalSamples ?? 0;
    }
  }

  if (includesSwapSweep(source) && !skipAll) {
    const swap = await loadSwapSweepSlice(db, swapQuery);
    contributors = includesEvaluate(source)
      ? mergeContributors(contributors, swap.contributors)
      : swap.contributors;
    performanceByCard = includesEvaluate(source)
      ? mergePerformanceMaps(performanceByCard, swap.performanceByCard)
      : swap.performanceByCard;
    olderSet = new Set([...olderSet, ...swap.olderCardIds]);
    totalRuns += swap.totalRuns;
    totalSamples += swap.totalSamples;
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

  let availableRunSettings: AvailableRunSettings = { goFirst: [], maxTurns: [] };
  if (!skipAll) {
    availableRunSettings = await loadAvailableRunSettings(db, {
      simType: options.simType,
      rulesVersion: options.version.rulesVersion,
      samplerVersion: options.version.samplerVersion,
      attributionVersion: options.attributionVersion,
      deckIds: deckIds,
      kind: includesEvaluate(source) ? "evaluate" : "optimize",
    });
  }

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
    availableRunSettings,
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
    runSettings?: RunSettingsFilter;
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
    .where("r.status", "in", DONE_STATUSES)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.attribution_version", "=", options.attributionVersion)
    .groupBy(["r.deck_id", "d.name"])
    .orderBy(sql`sum(coalesce(r.samples, 0))`, "desc");

  if (options.deckIds && options.deckIds.length > 0) {
    deckQuery = deckQuery.where("r.deck_id", "in", options.deckIds);
  }

  deckQuery = applyRunSettingsFilter(deckQuery, options.runSettings, "r");

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
    source?: CardDatabaseSource;
    cardId: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckIds?: string[];
    runSettings?: RunSettingsFilter;
  },
): Promise<CardDatabaseDeckRow[]> {
  const source = options.source ?? "evaluate";
  const { evaluateDeckIds, swapSweepDeckIds } = splitCardDatabaseDeckIds(
    source,
    options.deckIds,
  );
  const swapQuery = {
    simType: options.simType,
    version: options.version,
    attributionVersion: options.attributionVersion,
    deckIds: swapSweepDeckIds,
    runSettings: options.runSettings,
  };

  let rows: CardDatabaseDeckRow[] = [];

  if (includesEvaluate(source) && includeDeckScopedQuery(evaluateDeckIds)) {
    const stats = await evaluateDecksForCard(db, {
      ...options,
      deckIds: evaluateDeckIds,
    });
    const statsById = new Map(stats.map((row) => [row.deckId, row]));
    const samples = await loadEvaluateSamples(db, {
      simType: options.simType,
      version: options.version,
      attributionVersion: options.attributionVersion,
      deckIds: evaluateDeckIds,
      runSettings: options.runSettings,
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
      rows = stats.map((row) => deckRow(row.deckId, row.name, null, row));
    } else {
      let membership = await listDecksForCard(db, options.cardId);
      if (evaluateDeckIds !== undefined) {
        const allow = new Set(evaluateDeckIds);
        membership = membership.filter((deck) => allow.has(deck.id));
      }

      const fromMembership: CardDatabaseDeckRow[] = membership.map((deck) =>
        deckRow(deck.id, deck.name, deck.copies, statsById.get(deck.id)),
      );

      const seen = new Set(fromMembership.map((row) => row.deckId));
      const extras: CardDatabaseDeckRow[] = stats
        .filter((row) => !seen.has(row.deckId))
        .map((row) => deckRow(row.deckId, row.name, null, row));

      rows = [...fromMembership, ...extras];
    }
  }

  if (includesSwapSweep(source) && includeDeckScopedQuery(swapSweepDeckIds)) {
    const swapRows = await loadSwapSweepCardDeckRows(
      db,
      options.cardId,
      swapQuery,
    );
    rows = includesEvaluate(source) ? mergeDeckRows(rows, swapRows) : swapRows;
  }

  return rows;
}

/** Materialize / level kinds that count as "playing" a material card. */
const MATERIAL_PLAY_KINDS: Record<string, string[]> = {
  impact_hammer: ["materializeHammer"],
  poisoned_dagger: ["materializeDagger"],
  varuckan_soulknife: ["materializeSoulknife"],
  mercenary_blade: ["materializeBlade"],
  zander_1: ["floatForZander", "levelZander"],
  zander_2: ["onEnterLevel", "levelZander2", "zanderGyReturn"],
  tristan_1: ["floatForTristan", "levelTristan", "tristanRecollect"],
  assassins_ripper: ["floatForRipper", "materializeRipper", "activateRipper"],
  grand_crusaders_ring: ["materializeRing", "banishCrusaderRing"],
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
    source?: CardDatabaseSource;
    cardId: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckIds?: string[];
    runSettings?: RunSettingsFilter;
  },
): Promise<CardPlayMatrix> {
  const source = options.source ?? "evaluate";
  const { evaluateDeckIds } = splitCardDatabaseDeckIds(source, options.deckIds);
  if (!includesEvaluate(source)) {
    return { totalPlays: 0, totalSamples: 0, cells: [] };
  }
  if (!includeDeckScopedQuery(evaluateDeckIds)) {
    return { totalPlays: 0, totalSamples: 0, cells: [] };
  }

  const materialKinds = MATERIAL_PLAY_KINDS[options.cardId];

  let sampleQuery = db
    .selectFrom("run_samples as rs")
    .innerJoin("runs as r", "r.id", "rs.run_id")
    .select(sql<number>`coalesce(sum(rs.occurrence_count), 0)::int`.as("totalSamples"))
    .where("r.status", "in", DONE_STATUSES)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.attribution_version", "=", options.attributionVersion);

  if (evaluateDeckIds && evaluateDeckIds.length > 0) {
    sampleQuery = sampleQuery.where("r.deck_id", "in", evaluateDeckIds);
  }

  sampleQuery = applyRunSettingsFilter(sampleQuery, options.runSettings, "r");

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
    .where("r.status", "in", DONE_STATUSES)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.attribution_version", "=", options.attributionVersion)
    .groupBy([
      sql`(e.payload->>'turn')::int`,
      sql`e.payload->>'phase'`,
    ])
    .orderBy(sql`(e.payload->>'turn')::int`, "asc")
    .orderBy(sql`e.payload->>'phase'`, "asc");

  if (evaluateDeckIds && evaluateDeckIds.length > 0) {
    playQuery = playQuery.where("r.deck_id", "in", evaluateDeckIds);
  }

  playQuery = applyRunSettingsFilter(playQuery, options.runSettings, "r");

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
    source?: CardDatabaseSource;
    cardId: string;
    simType: string;
    version: VersionTriple;
    attributionVersion: number;
    deckIds?: string[];
    runSettings?: RunSettingsFilter;
  },
): Promise<CardDatabasePairings> {
  const source = options.source ?? "evaluate";
  const { evaluateDeckIds } = splitCardDatabaseDeckIds(source, options.deckIds);
  const empty: CardDatabasePairings = {
    cardId: options.cardId,
    totalSamples: 0,
    partners: [],
  };

  if (!includesEvaluate(source)) {
    return empty;
  }

  if (!includeDeckScopedQuery(evaluateDeckIds)) {
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
    .where("r.status", "in", DONE_STATUSES)
    .where("r.kind", "=", "evaluate")
    .where("r.deck_id", "is not", null)
    .where("r.sim_type", "=", options.simType)
    .where("r.rules_version", "=", options.version.rulesVersion)
    .where("r.sampler_version", "=", options.version.samplerVersion)
    .where("r.attribution_version", "=", options.attributionVersion);

  if (evaluateDeckIds && evaluateDeckIds.length > 0) {
    sampleQuery = sampleQuery.where("r.deck_id", "in", evaluateDeckIds);
  }

  sampleQuery = applyRunSettingsFilter(sampleQuery, options.runSettings, "r");

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
  const handImpacts = computeAllHandImpacts(samples);
  const selectedHandLift = handImpacts.get(selectedId)?.handLift ?? null;
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

    const partnerHandLift = handImpacts.get(partnerId)?.handLift ?? null;
    let pairsWithMeDelta = bothMean - selectedWithoutPartnerMean;
    let dependsOnMeDelta = bothMean - partnerWithoutSelectedMean;
    if (partnerHandLift != null) {
      pairsWithMeDelta -= partnerHandLift;
    }
    if (selectedHandLift != null) {
      dependsOnMeDelta -= selectedHandLift;
    }

    rows.push({
      cardId: partnerId,
      name: nameById.get(partnerId) ?? partnerId,
      bothMean,
      selectedWithoutPartnerMean,
      partnerWithoutSelectedMean,
      pairsWithMeDelta,
      dependsOnMeDelta,
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
