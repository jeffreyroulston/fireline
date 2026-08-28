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
  Assassin class stealth (e.g. Tweedledum) only counts after Zander has leveled.
- FiZa-specific safe reductions include: Poisoned Dagger activates immediately when ready, Arthur attacks before other allies, and bulk ally attacks.

## Architecture

Fireline is a small monorepo:

| Service | Path | Role |
|---------|------|------|
| **Web UI** | `apps/web` | Next.js frontend; calls the data API |
| **Data API** | `apps/api` | Hono + Kysely + Postgres; decks, run history, SSE relay |
| **Compute worker** | `crates/worker` | Stateless Rust HTTP service for solve/evaluate/optimize |

The browser no longer runs WebAssembly. All simulation runs on the Rust compute worker; the data API persists results and streams progress to the UI.

Shared request/response types live in `packages/contracts` (generated from the engine via `ts-rs`).

This repo uses [pnpm](https://pnpm.io/) workspaces (`pnpm-workspace.yaml`). Enable it via Corepack (`corepack enable`) or install pnpm globally.

## Run with Docker Compose

The production stack runs behind Caddy on port 80. The worker is internal-only; only the data API holds `DATABASE_URL`.

```bash
# Optional: stamp engine builds with the current git revision
export GIT_SHA="$(git rev-parse --short HEAD)"

docker compose up --build
```

Open [http://localhost](http://localhost). Browser requests to `/api/*` go to the data API; everything else goes to the Next.js UI.

Useful overrides:

- `FIRELINE_PORT=8080` — bind the proxy to a different host port
- `WORKER_CONCURRENCY` / `API_CONCURRENCY` — cap how many simulations run at once (Docker Compose defaults to `1`; local dev defaults to `2`)
- `RAYON_NUM_THREADS` — cap Rayon hand parallelism inside the compute worker (defaults to all logical CPUs)

### Threading model

Two knobs control throughput:

1. **Run concurrency** (`WORKER_CONCURRENCY`, `API_CONCURRENCY`): how many solve/evaluate/optimize requests run at the same time. Extra runs wait in the API queue.
2. **Hand parallelism** (Rayon inside the engine): within one deck evaluation, unique opening hands are solved across available CPU threads.

Docker Compose sets run concurrency to `1` so a single evaluation can use all cores. Local `cargo run -p ga-fire-worker` keeps the default of `2` concurrent runs unless you override the env var.

Monte Carlo deck evaluations report hand-level progress only (`12/64 hands`) when hands run in parallel. Per-rollout ticks are reserved for the serial progress path.

Postgres data persists in the `pgdata` Compose volume. Migrations run automatically when the data API starts.

## Run locally (development)

You need Postgres, the compute worker, the data API, and the web app.

```bash
# Terminal 1 — Postgres (example: local trust auth on :5432)
createdb fireline

# Terminal 2 — compute worker (:8081)
cargo run -p ga-fire-worker

# Terminal 3 — data API (:8080)
# apps/api/.env needs DATABASE_URL=postgres://postgres@localhost:5432/fireline
pnpm migrate
pnpm dev:api

# Terminal 4 — web UI (:3000, proxies /api → :8080)
pnpm install
pnpm dev
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
pnpm test
pnpm lint
pnpm build
pnpm bench
```

Regenerate shared TypeScript contracts after engine API changes:

```bash
pnpm build:contracts
```

## Current scope

The optimized rules and search live under `crates/engine`. TypeScript under
`apps/web/src/lib/engine` contains display metadata, decklist parsing, and UI-only
helpers such as legal-deck counting; it does not calculate game states or damage.

Supported maindeck pool includes the Zander FiZa list (Arthur, Red Hare, March Hare,
Rococo, burns like Planted Explosive / Intensified Pyre / Vermilion Decree, etc.).
Leveling uses **Zander, Prepared Scout**; weapons include Impact Hammer, Mercenary's
Blade, Poisoned Dagger, and Varuckan Soulknife.
