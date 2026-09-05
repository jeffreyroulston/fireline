import fs from "node:fs/promises";
import path from "node:path";
import { chunkText, slugify } from "../chunk.ts";
import { embedBatch } from "../embeddings.ts";
import { RAW_RULES_DIR, RULES_LLMS_URL } from "../paths.ts";
import type { ChunkRecord } from "../types.ts";

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+\.md)\)/g;

export type RulesPage = {
  title: string;
  url: string;
  body: string;
};

export function parseLlmsLinks(llmsTxt: string): Array<{ title: string; url: string }> {
  const links: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  for (const match of llmsTxt.matchAll(LINK_RE)) {
    const title = match[1]!.trim();
    const url = match[2]!.trim();
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ title, url });
  }
  return links;
}

function urlToFilename(url: string): string {
  const u = new URL(url);
  const base = u.pathname.replace(/^\//, "").replace(/\.md$/, "") || "index";
  return `${base.replace(/\//g, "__")}.md`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "text/markdown, text/plain, */*" },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status}`);
  }
  return res.text();
}

export async function fetchRulesPages(
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<RulesPage[]> {
  const llms = await fetchText(RULES_LLMS_URL);
  const links = parseLlmsLinks(llms);
  const pages: RulesPage[] = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i]!;
    onProgress?.(i + 1, links.length, link.title);
    const body = await fetchText(link.url);
    pages.push({ title: link.title, url: link.url, body });
  }

  return pages;
}

export async function writeRulesRaw(pages: RulesPage[]): Promise<void> {
  await fs.mkdir(RAW_RULES_DIR, { recursive: true });
  const existing = await fs.readdir(RAW_RULES_DIR);
  for (const name of existing) {
    if (name === ".gitkeep") continue;
    await fs.unlink(path.join(RAW_RULES_DIR, name));
  }

  for (const page of pages) {
    const file = path.join(RAW_RULES_DIR, urlToFilename(page.url));
    const header = `---\ntitle: ${JSON.stringify(page.title)}\nurl: ${page.url}\n---\n\n`;
    await fs.writeFile(file, header + page.body, "utf8");
  }
}

export async function loadRulesFromDisk(): Promise<RulesPage[]> {
  const names = await fs.readdir(RAW_RULES_DIR);
  const pages: RulesPage[] = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const full = path.join(RAW_RULES_DIR, name);
    const raw = await fs.readFile(full, "utf8");
    const titleMatch = raw.match(/^title:\s*(.+)$/m);
    const urlMatch = raw.match(/^url:\s*(.+)$/m);
    const body = raw.replace(/^---[\s\S]*?---\s*/, "");
    pages.push({
      title: titleMatch?.[1]?.replace(/^"|"$/g, "") ?? name,
      url: urlMatch?.[1]?.trim() ?? `file://${full}`,
      body,
    });
  }
  return pages;
}

export async function rulesPagesToChunks(
  pages: RulesPage[],
  onProgress?: (done: number, total: number) => void,
): Promise<ChunkRecord[]> {
  const drafts: Array<Omit<ChunkRecord, "vector">> = [];
  for (const page of pages) {
    const pieces = chunkText(page.body);
    for (const piece of pieces) {
      const id = `rules:${slugify(page.title)}:${piece.index}`;
      drafts.push({
        id,
        source: "rules",
        title: page.title,
        uri: page.url,
        text: `# ${page.title}\n\n${piece.text}`,
      });
    }
  }

  const vectors = await embedBatch(
    drafts.map((d) => d.text),
    onProgress,
  );
  return drafts.map((d, i) => ({ ...d, vector: vectors[i]! }));
}
