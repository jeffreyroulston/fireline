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

## Run locally

### Web UI

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The UI executes the release Rust engine as WebAssembly inside a Web Worker. The
checked-in 204 KB WASM package allows a normal Vercel build without installing a
Rust toolchain during deployment.

### Native CLI

For maximum local throughput, run the same engine natively:

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

### Rebuild WebAssembly

Install `wasm-pack`, then run:

```bash
npm run build:wasm
```

## Verify

```bash
npm test
npm run lint
npm run build
npm run bench
```

## Vercel

Deploy as a standard Next.js project. Search, sampling, and optimization run in
the browser worker, so Vercel only serves the static UI and WASM asset—there are
no serverless execution limits on simulations.

## Current scope

The optimized rules and search live under `crates/engine`. TypeScript under
`src/lib/engine` contains display metadata and decklist parsing only; it does not
calculate game states or damage.

Supported maindeck pool includes the Zander FiZa list (Arthur, Red Hare, March Hare,
Rococo, burns like Planted Explosive / Intensified Pyre / Vermilion Decree, etc.).
Leveling uses **Zander, Prepared Scout**; weapons include Impact Hammer, Mercenary's
Blade, Poisoned Dagger, and Varuckan Soulknife.
