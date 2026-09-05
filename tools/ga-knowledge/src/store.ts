import fs from "node:fs/promises";
import * as lancedb from "@lancedb/lancedb";
import { INDEX_DIR, TABLE_NAME } from "./paths.ts";
import type { ChunkRecord, SearchHit, SourceKind } from "./types.ts";

async function ensureIndexDir(): Promise<void> {
  await fs.mkdir(INDEX_DIR, { recursive: true });
}

export async function openDb(): Promise<lancedb.Connection> {
  await ensureIndexDir();
  return lancedb.connect(INDEX_DIR);
}

export async function tableExists(db: lancedb.Connection): Promise<boolean> {
  const names = await db.tableNames();
  return names.includes(TABLE_NAME);
}

export async function countRows(): Promise<number | null> {
  const db = await openDb();
  if (!(await tableExists(db))) return null;
  const table = await db.openTable(TABLE_NAME);
  return table.countRows();
}

export async function replaceSourceChunks(
  source: SourceKind,
  records: ChunkRecord[],
): Promise<void> {
  const db = await openDb();
  const exists = await tableExists(db);

  if (!exists) {
    if (records.length === 0) return;
    await db.createTable(TABLE_NAME, records);
    return;
  }

  const table = await db.openTable(TABLE_NAME);
  await table.delete(`source = '${source}'`);
  if (records.length > 0) {
    await table.add(records);
  }
}

export async function upsertChunks(records: ChunkRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDb();
  if (!(await tableExists(db))) {
    await db.createTable(TABLE_NAME, records);
    return;
  }

  const table = await db.openTable(TABLE_NAME);
  const ids = records.map((r) => `'${r.id.replace(/'/g, "''")}'`).join(", ");
  await table.delete(`id IN (${ids})`);
  await table.add(records);
}

export async function searchChunks(
  vector: number[],
  opts: { limit?: number; source?: SourceKind } = {},
): Promise<SearchHit[]> {
  const limit = opts.limit ?? 8;
  const db = await openDb();
  if (!(await tableExists(db))) {
    return [];
  }

  const table = await db.openTable(TABLE_NAME);
  let query = table.vectorSearch(vector).limit(limit);
  if (opts.source) {
    query = query.where(`source = '${opts.source}'`);
  }

  const rows = (await query.toArray()) as Array<{
    id: string;
    source: SourceKind;
    title: string;
    uri: string;
    text: string;
    _distance?: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    title: row.title,
    uri: row.uri,
    text: row.text,
    score: row._distance ?? 0,
  }));
}
