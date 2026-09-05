---
name: ga-rules
description: Search and store Grand Archive comprehensive rules, card text, and custom rulings via the local ga-knowledge CLI. Use when implementing or verifying GA game rules, card mechanics, keywords, combat, zones, costs, or when the user provides a new ruling to remember.
---

# GA Rules (local RAG)

Use the **local** knowledge CLI. Do **not** call gatcg.com / api.gatcg.com / rules.gatcg.com at query time.

## When to use

- Ambiguous Grand Archive rules (phases, combat, zones, abilities, keywords)
- Looking up official card effect text / errata
- User pastes a ruling that should persist for later agents

## Commands (repo root)

```bash
pnpm ga:status
pnpm ga:search -- "query text" [--limit 8] [--source rules|cards|rulings]
pnpm ga:remember -- --title "Short title" --text "Ruling body…"
pnpm ga:remember -- --file path/to/ruling.md
pnpm ga:ingest -- --fetch          # download + index (network; only when asked)
pnpm ga:index                      # re-index local raw/ + rulings/ only
```

`pnpm` forwards args after `--` to the package script.

## Workflow

1. `pnpm ga:status` — if `ready` is false, tell the user the corpus is empty and ask before running `ga:ingest -- --fetch`.
2. `pnpm ga:search -- "…"` — read returned `hits[].text` / `uri`; cite source (`rules` | `cards` | `rulings`).
3. Prefer `--source` when the question is clearly rules-only or card-only.
4. New ruling from the user → `pnpm ga:remember -- --title "…" --text "…"`. That writes `knowledge/ga/rulings/` and updates the index.

## Do not

- Scrape or fetch gatcg sites to answer a rules question when the index exists
- Invent rulings; if search is empty or weak, say so
- Run full ingest unless the user asked or status shows an empty corpus and they want it loaded
