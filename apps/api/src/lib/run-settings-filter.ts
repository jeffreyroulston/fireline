import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

export type RunSettingsFilter = {
  goFirst?: boolean[];
  maxTurns?: number[];
};

export function parseRunSettingsFilter(
  params: URLSearchParams,
): RunSettingsFilter | undefined {
  const goFirst: boolean[] = [];
  for (const value of params.getAll("go_first")) {
    if (value === "1" || value === "true") {
      goFirst.push(true);
    } else if (value === "0" || value === "false") {
      goFirst.push(false);
    }
  }

  const maxTurns: number[] = [];
  for (const value of params.getAll("max_turns")) {
    const turns = Number(value);
    if (Number.isInteger(turns) && turns >= 1 && turns <= 9) {
      maxTurns.push(turns);
    }
  }

  if (goFirst.length === 0 && maxTurns.length === 0) {
    return undefined;
  }

  return {
    ...(goFirst.length > 0 ? { goFirst } : {}),
    ...(maxTurns.length > 0 ? { maxTurns } : {}),
  };
}

export function isActiveRunSettingsFilter(
  filter: RunSettingsFilter | undefined,
): boolean {
  return Boolean(filter?.goFirst?.length || filter?.maxTurns?.length);
}

type FilterableQuery = {
  where: (
    lhs: string,
    op: "in",
    rhs: readonly boolean[] | readonly number[],
  ) => FilterableQuery;
};

export function applyRunSettingsFilter<Q extends FilterableQuery>(
  query: Q,
  filter: RunSettingsFilter | undefined,
  alias?: string,
): Q {
  if (!isActiveRunSettingsFilter(filter)) {
    return query;
  }
  const goCol = alias ? `${alias}.go_first` : "go_first";
  const turnsCol = alias ? `${alias}.max_turns` : "max_turns";
  let next = query;
  if (filter!.goFirst?.length) {
    next = next.where(goCol, "in", filter!.goFirst) as Q;
  }
  if (filter!.maxTurns?.length) {
    next = next.where(turnsCol, "in", filter!.maxTurns) as Q;
  }
  return next as Q;
}

type DeckScopeQuery = {
  where: (lhs: string, op: "=", rhs: string) => DeckScopeQuery;
};

/** Prefer deck_id so identical lists on different decks stay separate. */
export function applyDeckScope<Q extends DeckScopeQuery>(
  query: Q,
  options: { deckId?: string; deckHash?: string },
  alias?: string,
): Q {
  const idCol = alias ? `${alias}.deck_id` : "deck_id";
  const hashCol = alias ? `${alias}.deck_hash` : "deck_hash";
  if (options.deckId) {
    return query.where(idCol, "=", options.deckId) as Q;
  }
  if (options.deckHash) {
    return query.where(hashCol, "=", options.deckHash) as Q;
  }
  return query;
}

export type AvailableRunSettings = {
  goFirst: boolean[];
  maxTurns: number[];
};

export async function loadAvailableRunSettings(
  db: Kysely<Database>,
  options: {
    simType: string;
    rulesVersion: number;
    samplerVersion: number;
    attributionVersion: number;
    deckIds?: string[];
    kind?: "evaluate" | "optimize";
  },
): Promise<AvailableRunSettings> {
  let query = db
    .selectFrom("runs")
    .select(["go_first as goFirst", "max_turns as maxTurns"])
    .distinct()
    .where("status", "in", ["complete", "partial"])
    .where("sim_type", "=", options.simType)
    .where("rules_version", "=", options.rulesVersion)
    .where("sampler_version", "=", options.samplerVersion)
    .where("attribution_version", "=", options.attributionVersion)
    .where("go_first", "is not", null)
    .where("max_turns", "is not", null);

  if (options.kind) {
    query = query.where("kind", "=", options.kind);
  } else {
    query = query.where("kind", "in", ["evaluate", "optimize"]);
  }

  if (options.deckIds !== undefined) {
    if (options.deckIds.length === 0) {
      return { goFirst: [], maxTurns: [] };
    }
    query = query.where("deck_id", "in", options.deckIds);
  } else {
    query = query.where("deck_id", "is not", null);
  }

  const rows = await query.execute();
  const goFirstSet = new Set<boolean>();
  const maxTurnsSet = new Set<number>();
  for (const row of rows) {
    if (row.goFirst != null) {
      goFirstSet.add(row.goFirst);
    }
    if (row.maxTurns != null) {
      maxTurnsSet.add(row.maxTurns);
    }
  }
  return {
    goFirst: [...goFirstSet].sort((a, b) => Number(b) - Number(a)),
    maxTurns: [...maxTurnsSet].sort((a, b) => a - b),
  };
}
