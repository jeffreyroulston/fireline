import { createHash, randomUUID } from "node:crypto";

const CARD_ALIASES: Record<string, string> = {
  kurhazi_courier: "corhazi_courier",
  sadi_blood_harvester: "sadi",
  march_hare_mottled_host: "march_hare",
  rococo_explosive_maven: "rococo",
  tweedledum_rattled_dancer: "tweedledum",
  xiao_qiao_cinderkeeper: "xiao_qiao",
  arthur_young_heir: "arthur",
  red_hare_unrivaled_stallion: "red_hare",
  fire_brick: "brick",
};

export function normalizeCardToken(token: string): string | null {
  const normalized = token
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .split("_")
    .filter(Boolean)
    .join("_");
  if (!normalized) return null;
  return CARD_ALIASES[normalized] ?? normalized;
}

export function parseDeckText(text: string): Record<string, number> {
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
      const id = normalizeCardToken(countMatch[2]);
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + n;
      continue;
    }

    const id = normalizeCardToken(trimmed);
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
