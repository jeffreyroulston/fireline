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
