# Fireline

Rust-powered FiZa max-damage line searcher and deck-ratio simulator for Grand Archive.

## What it does

- Solves two- or three-turn Fire Assassin lines from a selected opening hand.
- Logs damage, allies, FireGY, memory, and hand after each action.
- Samples hands from a pasted decklist and reports mean, P50, P90, and range.
- Ratio lab searches card ratios with four strategies: **Random sample** (uniform random legal lists), **Hill climb** (local ±1-swap optimization with restarts), **Genetic algorithm** (population crossover/mutation), and **Swap sweep** (fixed-ratio card substitution with per-candidate stats).

The model follows the Mathematically Correct FiZa drill assumptions:

- Unknown draws are unplayable fire bricks, except the guaranteed going-second
  draw, which samples a real card from an attached maindeck and seed when one
  is available.
- The opponent kills non-stealth, non-immortal allies during its main phase.
  Assassin class stealth (e.g. Tweedledum) only counts after Zander has leveled.
- FiZa-specific safe reductions include: Poisoned Dagger activates in pre-recollect when ready, Arthur attacks before other allies, and bulk ally attacks.

## Architecture

Fireline is a small monorepo:

| Service | Path | Role |
|---------|------|------|
| **Web UI** | `apps/web` | Next.js solver/workbench at `/solver`; calls the data API |
| **Play UI** | `apps/play` | Next.js game client at `/play` |
| **Data API** | `apps/api` | Hono + Kysely + Postgres; decks, run history, SSE relay |
| **Compute worker** | `crates/worker` | Stateless Rust HTTP service for solve/evaluate/optimize |

The browser no longer runs WebAssembly. All simulation runs on the Rust compute worker; the data API persists results and streams progress to the UI.

Shared request/response types live in `packages/contracts` (generated from the engine via `ts-rs`).

This repo uses [pnpm](https://pnpm.io/) workspaces (`pnpm-workspace.yaml`). Enable it via Corepack (`corepack enable`) or install pnpm globally.

## Run with Docker Compose

The production stack runs behind Caddy on port 80. The worker is internal-only; only the data API holds `DATABASE_URL`. Images for `worker`, `api`, `web`, and `play` publish to GHCR on every push to `main`.

### First-time setup (published images)

1. Install [Docker Engine](https://docs.docker.com/engine/install/) or [Docker Desktop](https://docs.docker.com/desktop/) (Windows/macOS).
2. Clone this repo (Compose needs `compose.yaml` and `docker/Caddyfile`).
3. After the first successful [Publish images](.github/workflows/publish-images.yml) run, make the three GHCR packages public under the repo's Packages settings (`fireline-worker`, `fireline-api`, `fireline-web`), or `docker login ghcr.io` with a token that can read them.
4. Start the stack:

```bash
docker compose pull
docker compose up -d
```

Open [http://localhost/solver](http://localhost/solver) (or [http://localhost](http://localhost), which redirects). Caddy routes `/solver/*` → web, `/play/*` → play, `/api/*` → data API.

### Update to latest `main`

Pulls new images and restarts. Postgres data stays in the `pgdata` volume; API migrations run on startup.

Linux / macOS:

```bash
./scripts/update.sh
```

Windows (PowerShell):

```powershell
.\scripts\update.ps1
```

From this repo with Node installed: `pnpm update:stack`.

Pin a SHA tag instead of `latest` with `FIRELINE_IMAGE_TAG=abc1234` (short commit from the workflow).

### Build from source (optional)

```bash
# Optional: stamp engine builds with the current git revision
export GIT_SHA="$(git rev-parse --short HEAD)"

docker compose up --build
```

Useful overrides:

- `FIRELINE_PORT=8080` — bind the proxy to a different host port
- `FIRELINE_IMAGE_TAG=latest` — GHCR tag for worker/api/web (default `latest`)
- `WORKER_CONCURRENCY` / `API_CONCURRENCY` — cap how many simulations run at once (both default to `1` in Docker Compose; local dev defaults to `API_CONCURRENCY=1`, `WORKER_CONCURRENCY=2`)
- `RAYON_NUM_THREADS` — upper bound on Rayon hand parallelism (defaults to all logical CPUs). Monte Carlo / Oracle / Two-pass are further capped by free RAM (~3 GiB per concurrent hand) so 16 GiB machines do not OOM.
- `GA_FIRE_HAND_MEM_MB` — per-hand search memo budget in MiB (worker default `3072` ≈ 4M memo entries). Raise on a high-RAM machine via a gitignored root `.env` (see `.env.example`); Compose passes it through only when set, so other builds keep the default.
- `GA_FIRE_MEM_TOTAL_MB` / `GA_FIRE_MEM_RESERVE_MB` / `GA_FIRE_MEM_PARK_MB` — optional pressure thresholds (MiB). Total auto-detects from cgroup/`MemTotal` when unset.
- `WORKER_LOG_RUNS=1` — worker run diagnostics: logs each hand's start/finish and samples process RSS every 2 s (with in-flight hands) for deck evaluations. Use when a run dies mid-stream to see which hand was active and how fast memory climbed.

### Threading model

Two knobs control throughput:

1. **Run concurrency** (`WORKER_CONCURRENCY`, `API_CONCURRENCY`): how many solve/evaluate/optimize requests run at the same time. Extra runs wait in the API queue.
2. **Hand parallelism** (Rayon inside the engine): within one deck evaluation, unique opening hands are solved across available CPU threads.

Docker Compose sets both run concurrency values to `1` so a single evaluation can use all cores. Local `cargo run -p ga-fire-worker` defaults to `2` concurrent worker requests; the data API defaults to dispatching `1` run at a time unless you set `API_CONCURRENCY`.

Monte Carlo / Oracle / Two-pass enable Glimpse and keep a large search memo (often 1–3 GiB peak per concurrent hand). The engine caps those sims from total RAM (`(MemTotal − reserve) / ~3 GiB`) and only pauses new hands when free RAM is in the park danger zone. Fire Brick still uses the full Rayon pool. On Linux, freed pages are returned to the OS after each solve (`malloc_trim`).

Monte Carlo deck evaluations stream per-hand progress while hands run in parallel: the UI shows aggregate hand completion (`12/64 hands`) plus one live bar per concurrent opening hand as its rollouts advance. Aggregate per-rollout ticks on the shared progress channel remain reserved for the serial progress path.

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

# Terminal 4 — web UI (:3000, basePath /solver, proxies /solver/api → :8080)
pnpm install
pnpm dev
```

Open [http://localhost:3000/solver](http://localhost:3000/solver).

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
