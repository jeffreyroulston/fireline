#!/usr/bin/env node
import { runIngest } from "./commands/ingest.ts";
import { runRemember } from "./commands/remember.ts";
import { runSearch } from "./commands/search.ts";
import { runStatus } from "./commands/status.ts";
import type { SourceKind } from "./types.ts";

function usage(exitCode = 2): never {
  console.error(`ga-knowledge — local Grand Archive rules/cards RAG

Usage:
  ga-knowledge status
  ga-knowledge search <query> [--limit N] [--source rules|cards|rulings]
  ga-knowledge remember [--title TITLE] [--text BODY | --file PATH | BODY...]
  ga-knowledge ingest [--fetch] [--rules] [--cards] [--rulings]
  ga-knowledge index [--rules] [--cards] [--rulings]

Notes:
  ingest --fetch   Download from gatcg (rules + cards), then embed.
  index            Re-embed local raw/ + rulings/ only (no network).
  Default ingest/index targets: rules + cards + rulings.
`);
  process.exit(exitCode);
}

/** Drop pnpm/npm end-of-options markers so `pnpm ga:search -- foo` works. */
function stripPassthroughSeparators(args: string[]): string[] {
  return args.filter((a) => a !== "--");
}

function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function takeOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}`);
  }
  args.splice(i, 2);
  return value;
}

function parseSource(value: string | undefined): SourceKind | undefined {
  if (!value) return undefined;
  if (value === "rules" || value === "cards" || value === "rulings") return value;
  throw new Error(`Invalid --source ${value}`);
}

async function readFileText(filePath: string): Promise<string> {
  const fs = await import("node:fs/promises");
  return fs.readFile(filePath, "utf8");
}

async function main(): Promise<void> {
  const args = stripPassthroughSeparators(process.argv.slice(2));
  const cmd = args.shift();
  if (!cmd) usage();
  if (cmd === "-h" || cmd === "--help") usage(0);

  switch (cmd) {
    case "status": {
      await runStatus();
      return;
    }
    case "search": {
      const limitRaw = takeOption(args, "--limit");
      const source = parseSource(takeOption(args, "--source"));
      const query = args.join(" ").trim();
      if (!query) usage();
      await runSearch(query, {
        limit: limitRaw ? Number(limitRaw) : undefined,
        source,
      });
      return;
    }
    case "remember": {
      const title = takeOption(args, "--title");
      const textOpt = takeOption(args, "--text");
      const fileOpt = takeOption(args, "--file");
      let body = textOpt ?? "";
      if (fileOpt) body = await readFileText(fileOpt);
      if (!body) body = args.join(" ").trim();
      await runRemember({ title, body });
      return;
    }
    case "ingest":
    case "index": {
      const fetch = cmd === "ingest" && takeFlag(args, "--fetch");
      const rulesFlag = takeFlag(args, "--rules");
      const cardsFlag = takeFlag(args, "--cards");
      const rulingsFlag = takeFlag(args, "--rulings");
      const any = rulesFlag || cardsFlag || rulingsFlag;
      await runIngest({
        fetch,
        rules: any ? rulesFlag : true,
        cards: any ? cardsFlag : true,
        rulings: any ? rulingsFlag : true,
      });
      return;
    }
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
