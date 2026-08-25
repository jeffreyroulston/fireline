# Fireline

Rust-powered FiZa max-damage line searcher and deck-ratio simulator for Grand Archive.

## What it does

- Solves two- or three-turn Fire Assassin lines from a selected opening hand.
- Logs damage, allies, FireGY, memory, and hand after each action.
- Samples hands from a pasted decklist and reports mean, P50, P90, and range.
- Hill-climbs card ratios inside user-supplied minimum and maximum bounds.

The model follows the Mathematically Correct FiZa drill assumptions:

- Unknown draws are unplayable fire bricks.
- The opponent kills non-stealth, non-immortal allies during its main phase.
- FiZa-specific safe reductions include dagger/Arthur ordering and bulk ally attacks.

## Architecture

Fireline is a small monorepo:

| Service | Path | Role |
|---------|------|------|
| **Web UI** | `apps/web` | Next.js frontend; calls the data API |
| **Data API** | `apps/api` | Hono + Kysely + Postgres; decks, run history, SSE relay |
| **Compute worker** | `crates/worker` | Stateless Rust HTTP service for solve/evaluate/optimize |

The browser no longer runs WebAssembly. All simulation runs on the Rust compute worker; the data API persists results and streams progress to the UI.

Shared request/response types live in `packages/contracts` (generated from the engine via `ts-rs`).

## Run locally

You need Postgres, the compute worker, the data API, and the web app.

```bash
# Terminal 1 — Postgres (example: local trust auth on :5432)
createdb fireline

# Terminal 2 — compute worker (:8081)
cargo run -p ga-fire-worker

# Terminal 3 — data API (:8080)
# apps/api/.env needs DATABASE_URL=postgres://postgres@localhost:5432/fireline
npm run migrate -w @ga-fire/api
npm run dev:api

# Terminal 4 — web UI (:3000, proxies /api → :8080)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Override the API proxy target with `API_ORIGIN` when starting Next.js if the data API is not on `127.0.0.1:8080`.

### Native CLI

For ad-hoc runs without the stack:

```bash
cargo run -p ga-fire-cli --release -- solve \
  rending_flames arthur hasty_messenger kingdom_informant \
  ignited_stab sable_remnant clumsy_apprentice
```

Deck evaluation and optimization accept JSON request files:

```bash
cargo run -p ga-fire-cli --release -- evaluate deck-request.json
cargo run -p ga-fire-cli --release -- optimize optimize-request.json
```

## Verify

```bash
npm test
npm run lint
npm run build
npm run bench
```

Regenerate shared TypeScript contracts after engine API changes:

```bash
npm run build:contracts
```

## Current scope

The optimized rules and search live under `crates/engine`. TypeScript under
`apps/web/src/lib/engine` contains display metadata, decklist parsing, and UI-only
helpers such as legal-deck counting; it does not calculate game states or damage.

Supported maindeck pool includes the Zander FiZa list (Arthur, Red Hare, March Hare,
Rococo, burns like Planted Explosive / Intensified Pyre / Vermilion Decree, etc.).
Leveling uses **Zander, Prepared Scout**; weapons include Impact Hammer, Mercenary's
Blade, Poisoned Dagger, and Varuckan Soulknife.
