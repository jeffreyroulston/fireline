export const queryKeys = {
  decks: ["decks"] as const,
  materialDecks: ["materialDecks"] as const,
  catalog: ["catalog"] as const,
  workerVersion: ["workerVersion"] as const,
  runHistory: (scope: string, epoch = 0) =>
    ["history", scope, epoch] as const,
  versionGroups: (
    scope: string,
    sim: string,
    kind: "evaluate" | "optimize" | "all",
    epoch = 0,
  ) => ["versionGroups", scope, sim, kind, epoch] as const,
  pooledDamage: (filtersKey: string, epoch = 0) =>
    ["pooledDamage", filtersKey, epoch] as const,
  cardLeaderboard: (filtersKey: string, epoch = 0) =>
    ["cardLeaderboard", filtersKey, epoch] as const,
  pooledSampleHighlights: (filtersKey: string, epoch = 0) =>
    ["pooledSampleHighlights", filtersKey, epoch] as const,
  cardDatabase: (source: string, filters: string) =>
    ["cardDatabase", source, filters] as const,
  cardDatabaseCardDecks: (source: string, cardId: string, filters: string) =>
    ["cardDatabaseCardDecks", source, cardId, filters] as const,
  cardDatabasePlayMatrix: (cardId: string, filters: string) =>
    ["cardDatabasePlayMatrix", cardId, filters] as const,
  cardDatabasePairings: (cardId: string, filters: string) =>
    ["cardDatabasePairings", cardId, filters] as const,
};

export function historyScopeKey(options?: {
  deckId?: string;
  deckHash?: string;
}): string {
  if (options?.deckId) return `deck:${options.deckId}`;
  if (options?.deckHash) return `hash:${options.deckHash}`;
  return "all";
}

export function versionGroupsScopeKey(options?: {
  deckId?: string;
  deckHash?: string;
}): string {
  if (options?.deckId) return `deck:${options.deckId}`;
  if (options?.deckHash) return `hash:${options.deckHash}`;
  return "global";
}
