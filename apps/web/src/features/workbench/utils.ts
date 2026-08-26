import {
  PLAYABLE_CARD_IDS,
  listToCounts,
  type CardId,
  type DeckCounts,
  type OptimizeBounds,
} from "@/lib/engine";

export const REFINE_COPY_CEILING = 4;

/** Derive optimize bounds from a baseline list, cut budgets, and a global replacement pool. */
export function refineBounds(
  baseCounts: DeckCounts,
  cutBudgets: Partial<Record<CardId, number>>,
  replacements: Partial<Record<CardId, number>>,
): OptimizeBounds {
  const bounds: OptimizeBounds = {};
  for (const id of PLAYABLE_CARD_IDS) {
    const count = Math.max(0, baseCounts[id] ?? 0);
    const cut = Math.min(count, Math.max(0, cutBudgets[id] ?? 0));
    const min = count - cut;
    const replacementMax = replacements[id];
    let max: number;
    if (replacementMax != null) {
      const capped = Math.min(
        REFINE_COPY_CEILING,
        Math.max(0, replacementMax),
      );
      max = Math.max(min, capped);
    } else {
      max = count;
    }
    bounds[id] = { min, max };
  }
  return bounds;
}

export function makeSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export const OPENING_HAND_SIZE = 7;

/** Shuffle a deck and take the top `size` cards (default opening hand). */
export function drawOpeningHand(
  deckCards: CardId[],
  size = OPENING_HAND_SIZE,
): CardId[] {
  if (deckCards.length < size) {
    throw new Error(
      `Need at least ${size} recognized cards to draw a hand (${deckCards.length} available).`,
    );
  }
  const shuffled = [...deckCards];
  for (let index = shuffled.length - 1; index >= 1; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }
  return shuffled.slice(0, size);
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
