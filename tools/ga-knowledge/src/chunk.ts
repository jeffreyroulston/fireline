export type TextChunk = {
  text: string;
  index: number;
};

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP = 150;

/** Split long text into overlapping character windows on paragraph boundaries when possible. */
export function chunkText(
  text: string,
  maxChars = DEFAULT_MAX_CHARS,
  overlap = DEFAULT_OVERLAP,
): TextChunk[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) {
    return [{ text: cleaned, index: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + maxChars, cleaned.length);
    if (end < cleaned.length) {
      const window = cleaned.slice(start, end);
      const breakAt = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("\n"),
        window.lastIndexOf(". "),
      );
      if (breakAt > maxChars * 0.4) {
        end = start + breakAt + 1;
      }
    }

    const slice = cleaned.slice(start, end).trim();
    if (slice) {
      chunks.push({ text: slice, index });
      index += 1;
    }

    if (end >= cleaned.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
