import type { SavedDeck } from "@/lib/decks";

let cachedDecks: SavedDeck[] = [];
let cacheHydrated = false;

export function getCachedDecks(): {
  decks: SavedDeck[];
  hydrated: boolean;
} {
  return { decks: cachedDecks, hydrated: cacheHydrated };
}

export function setCachedDecks(decks: SavedDeck[]): void {
  cachedDecks = decks;
  cacheHydrated = true;
}
