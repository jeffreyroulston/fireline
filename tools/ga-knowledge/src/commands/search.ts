import { embedText } from "../embeddings.ts";
import { searchChunks } from "../store.ts";
import type { SourceKind } from "../types.ts";

export async function runSearch(
  query: string,
  opts: { limit?: number; source?: SourceKind } = {},
): Promise<void> {
  const q = query.trim();
  if (!q) {
    throw new Error("search requires a non-empty query");
  }

  const vector = await embedText(q);
  const hits = await searchChunks(vector, {
    limit: opts.limit ?? 8,
    source: opts.source,
  });

  if (hits.length === 0) {
    console.log(
      JSON.stringify(
        {
          query: q,
          hits: [],
          hint: "No results. Index may be empty — run `pnpm ga:status` then `pnpm ga:ingest` if needed.",
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        query: q,
        hits: hits.map((h) => ({
          source: h.source,
          title: h.title,
          uri: h.uri,
          score: h.score,
          text: h.text,
        })),
      },
      null,
      2,
    ),
  );
}
