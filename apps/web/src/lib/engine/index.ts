export * from "./types";
export * from "./cards";
export * from "./ratio";

import type { CardId, DeckCounts } from "./types";

/** UI-only decklist conversion. All simulation and search logic lives in Rust. */
export function listToCounts(cards: CardId[]): DeckCounts {
  const counts: DeckCounts = {};
  for (const card of cards) {
    counts[card] = (counts[card] ?? 0) + 1;
  }
  return counts;
}
