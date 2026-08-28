import { createHash, randomUUID } from "node:crypto";

export function normalizeCardToken(token: string): string | null {
  const normalized = token
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .split("_")
    .filter(Boolean)
    .join("_");
  return normalized || null;
}

export type CatalogLookup = {
  id: string;
  name: string;
  short: string;
  aliases: string[];
};

/** Map every known token (id, name, short, alias) to a catalog id. */
export function catalogTokenIndex(
  cards: CatalogLookup[],
): Map<string, string> {
  const index = new Map<string, string>();
  const add = (token: string | null, id: string) => {
    if (!token) return;
    if (!index.has(token)) {
      index.set(token, id);
    }
  };
  for (const card of cards) {
    add(card.id, card.id);
    add(normalizeCardToken(card.id.replaceAll("_", " ")), card.id);
    add(normalizeCardToken(card.name), card.id);
    add(normalizeCardToken(card.short), card.id);
    for (const alias of card.aliases) {
      add(normalizeCardToken(alias), card.id);
    }
  }
  return index;
}

export function resolveCatalogToken(
  token: string,
  index: Map<string, string>,
): string | null {
  const normalized = normalizeCardToken(token);
  if (!normalized) return null;
  return index.get(normalized) ?? null;
}

export function parseDeckText(
  text: string,
  index: Map<string, string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^(materials?|main\s*deck|maindeck|sideboard|side\s*board)\b/i.test(trimmed)) {
      continue;
    }

    const countMatch =
      trimmed.match(/^(\d+)\s*×\s*(.+)$/) ||
      trimmed.match(/^(\d+)x\s*(.+)$/i) ||
      trimmed.match(/^(\d+)\s+(.+)$/);
    if (countMatch) {
      const n = Math.min(60, parseInt(countMatch[1], 10));
      const id = resolveCatalogToken(countMatch[2], index);
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + n;
      continue;
    }

    const id = resolveCatalogToken(trimmed, index);
    if (id) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

export function deckHash(counts: Record<string, number>): string {
  const canonical = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function handHash(cardIds: string[]): string {
  const sorted = [...cardIds].sort();
  return createHash("sha256").update(sorted.join(",")).digest("hex");
}

export function newId(): string {
  return randomUUID();
}

export function damageHistogram(damages: number[]): number[] {
  const buckets = Array.from({ length: 256 }, () => 0);
  for (const damage of damages) {
    buckets[Math.min(255, Math.max(0, damage))] += 1;
  }
  return buckets;
}
