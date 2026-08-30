import type { CardId, LineEvent } from "@/lib/engine";

/** Count Play events per card id on a combat tape. */
export function playCountsFromEvents(events: LineEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "play" || !event.card) continue;
    counts.set(event.card, (counts.get(event.card) ?? 0) + 1);
  }
  return counts;
}

/**
 * Mark which slots were played, mutating `remaining` left-to-right.
 * Call opening hand first, then drawn cards, so opening copies claim plays
 * before mid-line draws of the same card.
 */
export function consumePlayedSlots(
  ids: readonly CardId[],
  remaining: Map<string, number>,
): boolean[] {
  return ids.map((id) => {
    const left = remaining.get(id) ?? 0;
    if (left <= 0) return false;
    remaining.set(id, left - 1);
    return true;
  });
}
