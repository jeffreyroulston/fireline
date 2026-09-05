# Grand Archive knowledge base

Local RAG corpus for Cursor agents. Query via the `ga-knowledge` CLI / `ga-rules` skill — not at app runtime.

| Path | Role |
|------|------|
| `raw/rules/` | Snapshots of comprehensive rules markdown (from `rules.gatcg.com`) |
| `raw/cards/` | Card JSON dumps (from `api.gatcg.com/cards/search`) |
| `rulings/` | User-provided rulings (committed) |
| `index/` | LanceDB vector store (gitignored; rebuild locally) |
| `manifest.json` | Ingest metadata |

## Commands

```bash
pnpm ga:status
pnpm ga:ingest          # fetch + index rules & cards (network)
pnpm ga:index           # re-index local raw/ + rulings/ only
pnpm ga:search -- "stealth combat"
pnpm ga:remember -- "Stealth: ..."
```

Do not hit gatcg sites at query time — search the local index only.
