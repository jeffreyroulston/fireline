import fs from "node:fs/promises";
import path from "node:path";
import { chunkText, slugify } from "../chunk.ts";
import { embedBatch } from "../embeddings.ts";
import { RULINGS_DIR } from "../paths.ts";
import type { ChunkRecord } from "../types.ts";

export type RulingDoc = {
  filename: string;
  title: string;
  body: string;
};

export async function listRulingFiles(): Promise<string[]> {
  const names = await fs.readdir(RULINGS_DIR);
  return names.filter((n) => n.endsWith(".md")).sort();
}

export async function loadRulingsFromDisk(): Promise<RulingDoc[]> {
  const names = await listRulingFiles();
  const docs: RulingDoc[] = [];
  for (const filename of names) {
    const body = await fs.readFile(path.join(RULINGS_DIR, filename), "utf8");
    const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
    docs.push({
      filename,
      title: heading || filename.replace(/\.md$/, ""),
      body,
    });
  }
  return docs;
}

export async function writeRulingFile(
  title: string,
  body: string,
): Promise<{ path: string; filename: string }> {
  await fs.mkdir(RULINGS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}-${slugify(title) || "ruling"}.md`;
  const full = path.join(RULINGS_DIR, filename);
  const content = `# ${title}\n\n${body.trim()}\n`;
  await fs.writeFile(full, content, "utf8");
  return { path: full, filename };
}

export async function rulingsToChunks(
  docs: RulingDoc[],
  onProgress?: (done: number, total: number) => void,
): Promise<ChunkRecord[]> {
  const drafts: Array<Omit<ChunkRecord, "vector">> = [];
  for (const doc of docs) {
    const pieces = chunkText(doc.body);
    for (const piece of pieces) {
      drafts.push({
        id: `rulings:${slugify(doc.filename)}:${piece.index}`,
        source: "rulings",
        title: doc.title,
        uri: `knowledge/ga/rulings/${doc.filename}`,
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
