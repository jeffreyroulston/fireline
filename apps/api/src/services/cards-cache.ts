import type { CardDef } from "@ga-fire/contracts";
import { loadCardCatalog } from "./worker.js";

let cached: CardDef[] | null = null;
let cachedAt = 0;

export async function getCards(workerBase: string, ttlMs = 60_000): Promise<CardDef[]> {
  const now = Date.now();
  if (cached && now - cachedAt < ttlMs) {
    return cached;
  }
  cached = await loadCardCatalog(workerBase);
  cachedAt = now;
  return cached;
}

export function invalidateCardCache(): void {
  cached = null;
  cachedAt = 0;
}
