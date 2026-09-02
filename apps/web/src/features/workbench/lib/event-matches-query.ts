import type { LineEvent } from "@ga-fire/contracts";
import {
  formatLineEventRow,
  type CatalogEntry,
} from "./format-line-event";

/** Match formatted text or card id (case insensitive). */
export function eventMatchesQuery(
  event: LineEvent,
  query: string,
  catalog: CatalogEntry[],
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  if (formatLineEventRow(event, catalog).toLowerCase().includes(needle)) {
    return true;
  }
  return (event.card ?? "").toLowerCase().includes(needle);
}

/** Match events involving a selected leaderboard card (same idea as searching its name). */
export function eventMatchesCard(
  event: LineEvent,
  cardId: string,
  catalog: CatalogEntry[],
): boolean {
  if (!cardId) return false;
  if (event.card === cardId) return true;
  if (event.drawn === cardId) return true;
  if (event.discarded === cardId) return true;
  if (event.memoryDraw === cardId) return true;
  if (event.commandAlly === cardId) return true;

  const entry = catalog.find((card) => card.id === cardId);
  if (!entry) {
    return eventMatchesQuery(event, cardId, catalog);
  }
  return eventMatchesQuery(event, entry.name, catalog);
}
