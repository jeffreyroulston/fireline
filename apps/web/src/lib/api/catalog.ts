import { fetchCards } from "./client";
import { CARDS } from "@/lib/engine/cards";
import type { CardId } from "@/lib/engine/types";

let hydrated = false;

/** Refresh display metadata from the data API (same ids as the static catalog). */
export async function hydrateCardCatalogFromApi(): Promise<void> {
  if (hydrated) {
    return;
  }
  try {
    const cards = (await fetchCards()) as Array<{
      id: string;
      name: string;
      short: string;
    }>;
    for (const card of cards) {
      const existing = CARDS[card.id as CardId];
      if (existing) {
        existing.name = card.name;
        existing.short = card.short;
      }
    }
    hydrated = true;
  } catch {
    // Keep the bundled catalog when the API is unavailable.
  }
}
