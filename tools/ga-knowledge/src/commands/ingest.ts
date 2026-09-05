import { cardsToChunks, fetchAllCards, loadCardsFromDisk, writeCardsRaw } from "../ingest/cards.ts";
import {
  fetchRulesPages,
  loadRulesFromDisk,
  rulesPagesToChunks,
  writeRulesRaw,
} from "../ingest/rules.ts";
import {
  loadRulingsFromDisk,
  rulingsToChunks,
} from "../ingest/rulings.ts";
import { readManifest, writeManifest } from "../manifest.ts";
import { replaceSourceChunks } from "../store.ts";

export type IngestOptions = {
  /** Fetch from network before indexing. */
  fetch: boolean;
  rules: boolean;
  cards: boolean;
  rulings: boolean;
};

function log(msg: string): void {
  console.error(msg);
}

export async function runIngest(opts: IngestOptions): Promise<void> {
  const manifest = await readManifest();
  const now = new Date().toISOString();
  const summary: Record<string, number> = {};

  if (opts.rules) {
    let pages;
    if (opts.fetch) {
      log("Fetching comprehensive rules from rules.gatcg.com …");
      pages = await fetchRulesPages((done, total, title) => {
        log(`  rules ${done}/${total}: ${title}`);
      });
      await writeRulesRaw(pages);
    } else {
      pages = await loadRulesFromDisk();
      if (pages.length === 0) {
        log("No local rules pages in knowledge/ga/raw/rules — skip (use ingest --fetch).");
      }
    }

    if (pages.length > 0) {
      log(`Embedding ${pages.length} rules pages …`);
      const chunks = await rulesPagesToChunks(pages, (done, total) => {
        if (done === total || done % 25 === 0) log(`  embed rules ${done}/${total}`);
      });
      await replaceSourceChunks("rules", chunks);
      manifest.sources.rules.lastIngestedAt = now;
      manifest.sources.rules.pageCount = pages.length;
      manifest.sources.rules.chunkCount = chunks.length;
      summary.rulesChunks = chunks.length;
    }
  }

  if (opts.cards) {
    let cards;
    if (opts.fetch) {
      log("Fetching cards from api.gatcg.com/cards/search …");
      cards = await fetchAllCards((page, totalPages, fetched) => {
        log(`  cards page ${page}/${totalPages} (${fetched} cards)`);
      });
      await writeCardsRaw(cards);
    } else {
      cards = await loadCardsFromDisk();
      if (cards.length === 0) {
        log("No local card dumps in knowledge/ga/raw/cards — skip (use ingest --fetch).");
      }
    }

    if (cards.length > 0) {
      log(`Embedding ${cards.length} cards …`);
      const chunks = await cardsToChunks(cards, (done, total) => {
        if (done === total || done % 100 === 0) log(`  embed cards ${done}/${total}`);
      });
      await replaceSourceChunks("cards", chunks);
      manifest.sources.cards.lastIngestedAt = now;
      manifest.sources.cards.cardCount = cards.length;
      manifest.sources.cards.chunkCount = chunks.length;
      summary.cardsChunks = chunks.length;
    }
  }

  if (opts.rulings) {
    const docs = await loadRulingsFromDisk();
    if (docs.length === 0) {
      log("No ruling markdown files yet.");
      await replaceSourceChunks("rulings", []);
      manifest.sources.rulings.lastIngestedAt = now;
      manifest.sources.rulings.fileCount = 0;
      manifest.sources.rulings.chunkCount = 0;
    } else {
      log(`Embedding ${docs.length} ruling files …`);
      const chunks = await rulingsToChunks(docs, (done, total) => {
        if (done === total || done % 10 === 0) log(`  embed rulings ${done}/${total}`);
      });
      await replaceSourceChunks("rulings", chunks);
      manifest.sources.rulings.lastIngestedAt = now;
      manifest.sources.rulings.fileCount = docs.length;
      manifest.sources.rulings.chunkCount = chunks.length;
      summary.rulingsChunks = chunks.length;
    }
  }

  await writeManifest(manifest);
  console.log(JSON.stringify({ ok: true, fetched: opts.fetch, summary }, null, 2));
}
