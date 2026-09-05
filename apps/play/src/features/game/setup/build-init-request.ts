import type { PlaytestInitRequest } from "@ga-fire/contracts";
import type { CardId, DeckCounts } from "@ga-fire/game";
import { PLAY_MAX_TURNS, subtractCards } from "@ga-fire/game";

export function buildPlaytestInitRequest(options: {
  hand: readonly CardId[];
  orderedDeck: readonly CardId[];
  goFirst: boolean;
  materials: DeckCounts;
}): PlaytestInitRequest {
  const hand = [...options.hand];
  const queue =
    options.orderedDeck.length > 0
      ? subtractCards([...options.orderedDeck], hand)
      : [];

  return {
    hand,
    goFirst: options.goFirst,
    maxTurns: PLAY_MAX_TURNS,
    materials: options.materials,
    queue,
  };
}
