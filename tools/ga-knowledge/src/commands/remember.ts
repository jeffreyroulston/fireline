import { rulingsToChunks, writeRulingFile } from "../ingest/rulings.ts";
import { readManifest, writeManifest } from "../manifest.ts";
import { upsertChunks } from "../store.ts";
import { listRulingFiles } from "../ingest/rulings.ts";

export async function runRemember(opts: {
  title?: string;
  body: string;
}): Promise<void> {
  const body = opts.body.trim();
  if (!body) {
    throw new Error("remember requires ruling text (--text or positional args)");
  }

  const title =
    opts.title?.trim() ||
    body.split("\n").find((l) => l.trim())?.slice(0, 80) ||
    "Untitled ruling";

  const { path: filePath, filename } = await writeRulingFile(title, body);
  const chunks = await rulingsToChunks([
    { filename, title, body: `# ${title}\n\n${body}` },
  ]);
  await upsertChunks(chunks);

  const manifest = await readManifest();
  const files = await listRulingFiles();
  manifest.sources.rulings.lastIngestedAt = new Date().toISOString();
  manifest.sources.rulings.fileCount = files.length;
  manifest.sources.rulings.chunkCount =
    (manifest.sources.rulings.chunkCount || 0) + chunks.length;
  await writeManifest(manifest);

  console.log(
    JSON.stringify(
      {
        ok: true,
        file: filePath,
        chunksIndexed: chunks.length,
        title,
      },
      null,
      2,
    ),
  );
}
