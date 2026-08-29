export * from "./types";
export * from "./cards";
export * from "./ratio";

import { CARDS } from "./cards";
import type { CardId, DeckCounts } from "./types";

/** UI-only decklist conversion. All simulation and search logic lives in Rust. */
export function listToCounts(cards: CardId[]): DeckCounts {
  const counts: DeckCounts = {};
  for (const card of cards) {
    counts[card] = (counts[card] ?? 0) + 1;
  }
  return counts;
}

/** Soft cap used by the visual deck builder. */
export function maxCopiesForCard(_id: CardId): number {
  return 4;
}

/** Serialize counts to the same `N Name` lines the Manage tab textarea uses. */
export function formatDecklist(counts: DeckCounts): string {
  const lines = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => {
      const byCount = b[1] - a[1];
      if (byCount !== 0) return byCount;
      const nameA = CARDS[a[0] as CardId]?.name ?? a[0];
      const nameB = CARDS[b[0] as CardId]?.name ?? b[0];
      return nameA.localeCompare(nameB);
    })
    .map(([id, count]) => `${count} ${CARDS[id as CardId]?.name ?? id}`);
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
