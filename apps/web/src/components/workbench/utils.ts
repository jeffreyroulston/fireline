import {
  PLAYABLE_CARD_IDS,
  listToCounts,
  type CardId,
  type DeckCounts,
  type OptimizeBounds,
} from "@/lib/engine";

export function makeBounds(): OptimizeBounds {
  return Object.fromEntries(
    PLAYABLE_CARD_IDS.map((id) => [id, { min: 0, max: 4 }]),
  );
}

export function makeSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Ensure opening-hand copies exist in the deck map so the engine can subtract them. */
export function deckCountsCoveringHand(
  deckCards: CardId[],
  hand: CardId[],
): DeckCounts {
  const counts = listToCounts(deckCards);
  const handCounts = listToCounts(hand);
  for (const [id, needed] of Object.entries(handCounts)) {
    const have = counts[id as CardId] ?? 0;
    if (have < needed) {
      counts[id as CardId] = needed;
    }
  }
  return counts;
}
