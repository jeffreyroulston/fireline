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

/** Coerce user input to the engine's unsigned 32-bit seed range. */
export function normalizeSeed(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.trunc(value) >>> 0;
}

export const OPENING_HAND_SIZE = 7;

/** Match the engine's splitmix64-style `Rng` so seeded shuffles line up. */
class Rng {
  private state: bigint;

  constructor(seed: number) {
    this.state = BigInt(seed >>> 0);
  }

  next(): bigint {
    const mask = BigInt("0xffffffffffffffff");
    this.state = (this.state + BigInt("0x9e3779b97f4a7c15")) & mask;
    let z = this.state;
    z = ((z ^ (z >> BigInt(30))) * BigInt("0xbf58476d1ce4e5b9")) & mask;
    z = ((z ^ (z >> BigInt(27))) * BigInt("0x94d049bb133111eb")) & mask;
    return (z ^ (z >> BigInt(31))) & mask;
  }

  index(len: number): number {
    return Number(this.next() % BigInt(len));
  }
}

/** Expand counts in sorted id order, matching the engine's `parse_counts`. */
export function cardsFromCounts(counts: DeckCounts): CardId[] {
  const cards: CardId[] = [];
  for (const id of Object.keys(counts).sort()) {
    const copies = counts[id as CardId] ?? 0;
    for (let n = 0; n < copies; n += 1) {
      cards.push(id as CardId);
    }
  }
  return cards;
}

/** Fisher-Yates with the engine RNG. Same seed, same pile. */
export function shuffleDeck(cards: CardId[], seed: number): CardId[] {
  const next = [...cards];
  const rng = new Rng(seed);
  for (let index = next.length - 1; index >= 1; index -= 1) {
    const swapIndex = rng.index(index + 1);
    const current = next[index]!;
    next[index] = next[swapIndex]!;
    next[swapIndex] = current;
  }
  return next;
}

/** Shuffle a list with `seed` and take the top `size` cards. */
export function drawOpeningHand(
  deckCards: CardId[],
  size = OPENING_HAND_SIZE,
  seed = makeSeed(),
): CardId[] {
  if (deckCards.length < size) {
    throw new Error(
      `Need at least ${size} recognized cards to draw a hand (${deckCards.length} available).`,
    );
  }
  return shuffleDeck(deckCards, seed).slice(0, size);
}

/** Remove one copy of each taken card from `from` (multiset subtract). */
export function subtractCards(from: CardId[], take: CardId[]): CardId[] {
  const remaining = [...from];
  for (const id of take) {
    const index = remaining.indexOf(id);
    if (index !== -1) {
      remaining.splice(index, 1);
    }
  }
  return remaining;
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
