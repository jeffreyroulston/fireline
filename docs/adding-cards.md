# Adding a card

The Rust engine catalog is the source of truth. TS / API seeds are generated.

## Simple card (stats + keywords + known effects)

1. Add a `Card` enum variant at the end of [`crates/engine/src/cards/mod.rs`](../crates/engine/src/cards/mod.rs) and bump `CARD_COUNT`.
2. Append matching entries to `ALL_CARDS` / `PLAYABLE_CARDS` (same order as the discriminant).
3. Append one `CatalogEntry` in [`crates/engine/src/cards/catalog.rs`](../crates/engine/src/cards/catalog.rs):
   - stats (`id`, `name`, `short`, `kind`, `cost`, `fire`, `power`, `life`)
   - `keywords` (`Fast`, `Stealth`, `Kindle(n)`, `Prepare(n)`, `Imbue(n)`, …)
   - `aliases` for decklist tokens
   - `on_play` / `on_enter` as composed [`Effect`](../crates/engine/src/cards/effects.rs) primitives
4. Add art under the existing image map if needed.
5. Sync consumers:

```bash
pnpm sync:cards
```

6. Update `compute_card_digest` expectation only when stats/keywords that affect simulation change (`crates/engine/src/version.rs` test).
7. Run `cargo test -p ga-fire-engine --lib`.

You should **not** need to edit `apply.rs` for vanilla allies or burn/draw actions that use existing primitives.

## When to add a primitive vs a snowflake

| Situation | Do this |
|-----------|---------|
| Numbers + known keywords + known verbs | Catalog row only |
| New verb / condition used by ≥1 card | Add `Effect` / `Cond` / `Keyword`, then data |
| Unique interactive targeting / FiZa policy | Keep logic in apply; document in `cards/snowflakes.rs` |

## Authoring checklist

- [ ] `CATALOG[i].card.index() == i`
- [ ] `parse_card` resolves id + aliases
- [ ] `pnpm sync:cards` refreshed `packages/game` + `apps/api` seeds
- [ ] Image path added
- [ ] DB: new environments still need a migration (or catalog upsert) for Postgres rows — seed data is synced, apply path is separate
- [ ] Tests cover the new effect path if non-trivial
