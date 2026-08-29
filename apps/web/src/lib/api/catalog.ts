import { fetchCards } from "./client";
import { hydrateCatalog } from "./catalog-hydrate";

/** Client-side catalog hydration (used when server prefetch is unavailable). */
export async function hydrateCardCatalogFromApi(): Promise<void> {
  try {
    const cards = await fetchCards();
    if (Array.isArray(cards) && cards.length > 0) {
      hydrateCatalog(cards);
    }
  } catch {
    // Keep the bundled catalog when the API is unavailable.
  }
}
