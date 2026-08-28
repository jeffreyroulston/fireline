import type { SimType } from "@/lib/engine";
import type { Tab } from "./types";

export const PATH_BY_TAB: Record<Tab, string> = {
  line: "hand",
  manage: "decks",
  deck: "deck-damage",
  ratios: "ratios",
  cards: "cards",
  history: "history",
  info: "info",
};

export const TAB_BY_PATH: Record<string, Tab> = Object.fromEntries(
  Object.entries(PATH_BY_TAB).map(([tab, path]) => [path, tab as Tab]),
) as Record<string, Tab>;

export const QUERY_KEYS_BY_TAB: Record<Tab, readonly string[]> = {
  line: [],
  manage: [],
  deck: [],
  ratios: [],
  cards: ["sim", "kind", "card", "deck"],
  history: ["sim", "vg", "card"],
  info: [],
};

const SIM_TYPES = new Set<SimType>([
  "fire_brick",
  "monte_carlo",
  "two_pass",
  "oracle_only",
]);

const CARD_KINDS = new Set(["ally", "attack", "action", "item"]);

/** Path segments that must never be treated as workbench modes. */
export const RESERVED_PATH_SEGMENTS = new Set(["api"]);

export function tabFromPath(mode: string): Tab | null {
  if (RESERVED_PATH_SEGMENTS.has(mode)) {
    return null;
  }
  return TAB_BY_PATH[mode] ?? null;
}

export function parseWorkbenchPath(pathname: string): {
  tab: Tab | null;
  deckId?: string;
} {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { tab: null };
  }
  const [mode, deckId] = segments;
  const tab = tabFromPath(mode);
  if (!tab) {
    return { tab: null };
  }
  return { tab, deckId };
}

export function workbenchHref(
  tab: Tab,
  deckId?: string,
  query?: URLSearchParams | string,
): string {
  const path = `/${PATH_BY_TAB[tab]}${deckId ? `/${deckId}` : ""}`;
  if (!query) {
    return path;
  }
  const qs = typeof query === "string" ? query : query.toString();
  return qs ? `${path}?${qs}` : path;
}

export function parseSimParam(value: string | null): SimType | null {
  if (!value || !SIM_TYPES.has(value as SimType)) {
    return null;
  }
  return value as SimType;
}

export function parseKindParam(value: string | null): string | null {
  if (!value || !CARD_KINDS.has(value)) {
    return null;
  }
  return value;
}

export function cleanQueryForTab(
  tab: Tab,
  params: URLSearchParams,
): URLSearchParams {
  const allowed = new Set(QUERY_KEYS_BY_TAB[tab]);
  const next = new URLSearchParams();

  for (const [key, value] of params.entries()) {
    if (!allowed.has(key) || !value) {
      continue;
    }
    if (key === "sim") {
      const sim = parseSimParam(value);
      if (sim && sim !== "fire_brick") {
        next.set("sim", sim);
      }
      continue;
    }
    if (key === "kind") {
      const kind = parseKindParam(value);
      if (kind) {
        next.set("kind", kind);
      }
      continue;
    }
    next.set(key, value);
  }

  return next;
}

export function historyQueryPatch(
  current: URLSearchParams,
  patch: {
    sim?: SimType;
    vg?: string;
    card?: string | null;
  },
): URLSearchParams {
  const next = new URLSearchParams(current.toString());

  if (patch.sim !== undefined) {
    if (patch.sim === "fire_brick") {
      next.delete("sim");
    } else {
      next.set("sim", patch.sim);
    }
  }

  if (patch.vg !== undefined) {
    if (patch.vg) {
      next.set("vg", patch.vg);
    } else {
      next.delete("vg");
    }
  }

  if (patch.card !== undefined) {
    if (patch.card) {
      next.set("card", patch.card);
    } else {
      next.delete("card");
    }
  }

  return cleanQueryForTab("history", next);
}

export function cardsQueryPatch(
  current: URLSearchParams,
  patch: {
    sim?: SimType;
    kind?: string | null;
    card?: string | null;
    deck?: string | null;
  },
): URLSearchParams {
  const next = new URLSearchParams(current.toString());

  if (patch.sim !== undefined) {
    if (patch.sim === "fire_brick") {
      next.delete("sim");
    } else {
      next.set("sim", patch.sim);
    }
  }

  if (patch.kind !== undefined) {
    if (patch.kind) {
      next.set("kind", patch.kind);
    } else {
      next.delete("kind");
    }
  }

  if (patch.card !== undefined) {
    if (patch.card) {
      next.set("card", patch.card);
    } else {
      next.delete("card");
    }
  }

  if (patch.deck !== undefined) {
    if (patch.deck) {
      next.set("deck", patch.deck);
    } else {
      next.delete("deck");
    }
  }

  return cleanQueryForTab("cards", next);
}
