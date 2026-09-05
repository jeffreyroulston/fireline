import {
  PLAYABLE_CARD_IDS,
  type CardId,
  type DeckCounts,
  type OptimizeBounds,
} from "@/lib/engine";

export {
  OPENING_HAND_SIZE,
  cardsFromCounts,
  deckCountsCoveringHand,
  drawOpeningHand,
  makeSeed,
  normalizeSeed,
  resolveRunSeed,
  shuffleDeck,
  subtractCards,
} from "@ga-fire/game";

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
