import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (tools/ga-knowledge/src → ../../..) */
export const REPO_ROOT = path.resolve(here, "../../..");

export const KNOWLEDGE_ROOT = path.join(REPO_ROOT, "knowledge/ga");
export const RAW_RULES_DIR = path.join(KNOWLEDGE_ROOT, "raw/rules");
export const RAW_CARDS_DIR = path.join(KNOWLEDGE_ROOT, "raw/cards");
export const RULINGS_DIR = path.join(KNOWLEDGE_ROOT, "rulings");
export const INDEX_DIR = path.join(KNOWLEDGE_ROOT, "index");
export const MANIFEST_PATH = path.join(KNOWLEDGE_ROOT, "manifest.json");

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;
export const TABLE_NAME = "chunks";

export const RULES_LLMS_URL = "https://rules.gatcg.com/llms.txt";
export const CARDS_SEARCH_URL = "https://api.gatcg.com/cards/search";
