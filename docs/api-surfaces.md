# API surfaces

One Hono process ([`apps/api`](../apps/api)), two product surfaces plus shared reads. Paths are unchanged; ownership is by route module.

| Surface | Module | Routes | Callers |
|---------|--------|--------|---------|
| **Shared** | [`routes/shared.ts`](../apps/api/src/routes/shared.ts) | `/health`, `/version`, `/cards`, `/cards/:id` | play + web |
| **Game** | [`routes/game.ts`](../apps/api/src/routes/game.ts) | `/game/v1/{init,legal,legal-targets,combat/declare,combat/resolve,apply}`; legacy `/playtest/*` | play + web line/playtest |
| **Duels** | [`routes/duels.ts`](../apps/api/src/routes/duels.ts) | `/game/v1/duels*` (create/join/rejoin/ready/start/action/combat/declare/combat/retaliate/events) | **play** champion duel |
| **Play decks** | [`routes/play-decks.ts`](../apps/api/src/routes/play-decks.ts) | `/play-decks*`, `/play-material-decks*` | **play** builder + setup |
| **Decks** | [`routes/decks.ts`](../apps/api/src/routes/decks.ts) | `/decks*`, `/material-decks*` | **web** workbench / sim |
| **Workbench** | [`routes/workbench.ts`](../apps/api/src/routes/workbench.ts) | `/solve`, `/runs*`, `/analysis/*` | **web only** |

## Ownership rules

- Play may call **shared**, **game**, **duels**, and **play decks** endpoints. It must not call workbench routes (`/solve`, `/runs`, `/analysis`) or sim `/decks*` / `/material-decks*`.
- Workbench-only features (evaluate/optimize, analysis, solve oracle) live under `routes/workbench.ts`. Do not put them in `routes/game.ts`.
- Play decks (`play_decks` / `play_material_decks`) are separate from sim decks (`decks` / `material_decks`). No shared rows or run-locks.
- Interactive legality uses engine **Full** rules via the worker playtest handlers. Search/solve uses **SolverReduced**. Do not wire SolverReduced into `/game/v1`.
- Attack targeting (stealth / taunt / true sight) is engine-owned via `POST /game/v1/legal-targets` (actor state + opponent public view). Hub/play must not reimplement those filters.
- Dual-board combat resolve is engine-owned via `POST /game/v1/combat/declare` and `POST /game/v1/combat/resolve`. Hub stores pending combat and forwards the defender’s retaliate choice; it must not reimplement damage math. Solo Spirit attacks use the same endpoints with a synthetic champion opponent (`retaliate: false`).
- Prefer `/game/v1/*` for new clients. `/playtest/*` is a legacy alias to the same worker handlers.
- Card catalog: engine digest is the rules truth. Clients compare `GET /version` `cardDigest` to `BUNDLED_CARD_DIGEST` from `pnpm sync:cards` and hydrate from `GET /cards` on mismatch.
- Champion duels: two seats × two FiZa boards; attacks use combat declare/resolve (not Spirit damage remap). Non-attack Spirit damage remapping is retired for duel attacks.

## Compute

Both game and workbench proxy to [`crates/worker`](../crates/worker). The worker is internal (`WORKER_URL`); only the API is public via Caddy `/api/*`.

## Front-door routes (Caddy)

| Browser path | Upstream |
|--------------|----------|
| `/api/*` | `api:8080` (path stripped) |
| `/play*` | `play:3000` (Next `basePath: /play`) |
| `/solver*` | `web:3000` (Next `basePath: /solver`) |
| `/` and legacy root paths | 301 → `/solver{uri}` |

UI clients call their own prefix (`/solver/api/*`, `/play/api/*`); Next rewrites those to the data API. Direct `/api/*` remains available for non-UI callers.
