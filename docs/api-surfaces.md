# API surfaces

One Hono process ([`apps/api`](../apps/api)), two product surfaces plus shared reads. Paths are unchanged; ownership is by route module.

| Surface | Module | Routes | Callers |
|---------|--------|--------|---------|
| **Shared** | [`routes/shared.ts`](../apps/api/src/routes/shared.ts) | `/health`, `/version`, `/cards`, `/cards/:id` | play + web |
| **Game** | [`routes/game.ts`](../apps/api/src/routes/game.ts) | `/game/v1/{init,legal,apply}`; legacy `/playtest/*` | play + web line/playtest |
| **Decks** | [`routes/decks.ts`](../apps/api/src/routes/decks.ts) | `/decks*`, `/material-decks*` | play **reads**; web reads + writes |
| **Workbench** | [`routes/workbench.ts`](../apps/api/src/routes/workbench.ts) | `/solve`, `/runs*`, `/analysis/*` | **web only** |

## Ownership rules

- Play may call **shared**, **game**, and deck **GET** endpoints. It must not call workbench routes (`/solve`, `/runs`, `/analysis`).
- Workbench-only features (evaluate/optimize, analysis, solve oracle) live under `routes/workbench.ts`. Do not put them in `routes/game.ts`.
- Interactive legality uses engine **Full** rules via the worker playtest handlers. Search/solve uses **SolverReduced**. Do not wire SolverReduced into `/game/v1`.
- Prefer `/game/v1/*` for new clients. `/playtest/*` is a legacy alias to the same worker handlers.
- Card catalog: engine digest is the rules truth. Clients compare `GET /version` `cardDigest` to `BUNDLED_CARD_DIGEST` from `pnpm sync:cards` and hydrate from `GET /cards` on mismatch.

## Compute

Both game and workbench proxy to [`crates/worker`](../crates/worker). The worker is internal (`WORKER_URL`); only the API is public via Caddy `/api/*`.
