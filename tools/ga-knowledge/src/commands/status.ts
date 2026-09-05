import fs from "node:fs/promises";
import {
  INDEX_DIR,
  KNOWLEDGE_ROOT,
  RAW_CARDS_DIR,
  RAW_RULES_DIR,
  RULINGS_DIR,
} from "../paths.ts";
import { readManifest } from "../manifest.ts";
import { countRows } from "../store.ts";
import { listRulingFiles } from "../ingest/rulings.ts";

async function countFiles(dir: string, pred: (name: string) => boolean): Promise<number> {
  try {
    const names = await fs.readdir(dir);
    return names.filter(pred).length;
  } catch {
    return 0;
  }
}

export async function runStatus(): Promise<void> {
  const manifest = await readManifest();
  const ruleFiles = await countFiles(RAW_RULES_DIR, (n) => n.endsWith(".md"));
  const cardShards = await countFiles(
    RAW_CARDS_DIR,
    (n) => n.startsWith("cards-") && n.endsWith(".json"),
  );
  const rulingFiles = await listRulingFiles();
  const indexed = await countRows();

  const ready =
    indexed != null &&
    indexed > 0 &&
    (ruleFiles > 0 || cardShards > 0 || rulingFiles.length > 0);

  console.log(
    JSON.stringify(
      {
        ready,
        knowledgeRoot: KNOWLEDGE_ROOT,
        indexDir: INDEX_DIR,
        embeddingModel: manifest.embeddingModel,
        indexedChunks: indexed,
        disk: {
          rulePages: ruleFiles,
          cardShards,
          rulingFiles: rulingFiles.length,
        },
        manifest: manifest.sources,
        hint: ready
          ? "Index is ready for local search."
          : "Corpus empty. Run `pnpm ga:ingest` when you want to load official rules/cards.",
      },
      null,
      2,
    ),
  );
}
