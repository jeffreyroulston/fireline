import fs from "node:fs/promises";
import path from "node:path";
import { chunkText, slugify } from "../chunk.ts";
import { embedBatch } from "../embeddings.ts";
import { CARDS_SEARCH_URL, RAW_CARDS_DIR } from "../paths.ts";
import type { ChunkRecord } from "../types.ts";

export type GatcgCard = {
  name: string;
  slug: string;
  types?: string[];
  subtypes?: string[];
  classes?: string[];
  elements?: string[];
  effect_raw?: string | null;
  flavor?: string | null;
  rule?: Array<{ title?: string; description?: string; date_added?: string }>;
  cost?: { type?: string; value?: string | null };
  power?: number | null;
  life?: number | null;
  level?: number | null;
  speed?: boolean | null;
  durability?: number | null;
};

type SearchResponse = {
  data: GatcgCard[];
  has_more: boolean;
  page: number;
  total_pages: number;
  total_cards: number;
};

async function fetchPage(page: number, pageSize = 50): Promise<SearchResponse> {
  const url = new URL(CARDS_SEARCH_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("sort", "name");
  url.searchParams.set("order", "ASC");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status}`);
  }
  return (await res.json()) as SearchResponse;
}

export async function fetchAllCards(
  onProgress?: (page: number, totalPages: number, fetched: number) => void,
): Promise<GatcgCard[]> {
  const first = await fetchPage(1);
  const cards = [...first.data];
  onProgress?.(1, first.total_pages, cards.length);

  for (let page = 2; page <= first.total_pages; page++) {
    const res = await fetchPage(page);
    cards.push(...res.data);
    onProgress?.(page, first.total_pages, cards.length);
  }

  return cards;
}

export async function writeCardsRaw(cards: GatcgCard[]): Promise<void> {
  await fs.mkdir(RAW_CARDS_DIR, { recursive: true });
  const existing = await fs.readdir(RAW_CARDS_DIR);
  for (const name of existing) {
    if (name === ".gitkeep") continue;
    await fs.unlink(path.join(RAW_CARDS_DIR, name));
  }

  const shardSize = 200;
  for (let i = 0; i < cards.length; i += shardSize) {
    const shard = cards.slice(i, i + shardSize);
    const file = path.join(
      RAW_CARDS_DIR,
      `cards-${String(Math.floor(i / shardSize) + 1).padStart(3, "0")}.json`,
    );
    await fs.writeFile(file, `${JSON.stringify(shard, null, 2)}\n`, "utf8");
  }

  await fs.writeFile(
    path.join(RAW_CARDS_DIR, "meta.json"),
    `${JSON.stringify({ cardCount: cards.length, fetchedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

export async function loadCardsFromDisk(): Promise<GatcgCard[]> {
  const names = (await fs.readdir(RAW_CARDS_DIR)).filter(
    (n) => n.startsWith("cards-") && n.endsWith(".json"),
  );
  names.sort();
  const cards: GatcgCard[] = [];
  for (const name of names) {
    const raw = await fs.readFile(path.join(RAW_CARDS_DIR, name), "utf8");
    const parsed = JSON.parse(raw) as GatcgCard[];
    cards.push(...parsed);
  }
  return cards;
}

export function cardToDocument(card: GatcgCard): string {
  const lines = [
    `# ${card.name}`,
    `Slug: ${card.slug}`,
    `Types: ${(card.types ?? []).join(", ") || "—"}`,
    `Subtypes: ${(card.subtypes ?? []).join(", ") || "—"}`,
    `Classes: ${(card.classes ?? []).join(", ") || "—"}`,
    `Elements: ${(card.elements ?? []).join(", ") || "—"}`,
  ];

  if (card.cost) {
    lines.push(`Cost: ${card.cost.type ?? "?"} ${card.cost.value ?? ""}`.trim());
  }
  if (card.power != null) lines.push(`Power: ${card.power}`);
  if (card.life != null) lines.push(`Life: ${card.life}`);
  if (card.level != null) lines.push(`Level: ${card.level}`);
  if (card.durability != null) lines.push(`Durability: ${card.durability}`);
  if (card.speed != null) lines.push(`Speed: ${card.speed ? "fast" : "slow"}`);

  lines.push("", "## Effect", card.effect_raw?.trim() || "(none)");

  if (card.flavor?.trim()) {
    lines.push("", "## Flavor", card.flavor.trim());
  }

  if (card.rule && card.rule.length > 0) {
    lines.push("", "## Card rules / errata");
    for (const r of card.rule) {
      lines.push(`### ${r.title || "Ruling"}`);
      if (r.date_added) lines.push(`Date: ${r.date_added}`);
      lines.push(r.description || "");
    }
  }

  return lines.join("\n");
}

export async function cardsToChunks(
  cards: GatcgCard[],
  onProgress?: (done: number, total: number) => void,
): Promise<ChunkRecord[]> {
  const drafts: Array<Omit<ChunkRecord, "vector">> = [];
  for (const card of cards) {
    const doc = cardToDocument(card);
    const pieces = chunkText(doc);
    for (const piece of pieces) {
      drafts.push({
        id: `cards:${slugify(card.slug)}:${piece.index}`,
        source: "cards",
        title: card.name,
        uri: `https://index.gatcg.com/card/${card.slug}`,
        text: piece.text,
      });
    }
  }

  const vectors = await embedBatch(
    drafts.map((d) => d.text),
    onProgress,
  );
  return drafts.map((d, i) => ({ ...d, vector: vectors[i]! }));
}
