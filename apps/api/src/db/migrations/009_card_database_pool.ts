import { sql, type Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  // Orphan evaluate/optimize rows cannot satisfy deck_id requirements.
  await sql`
    DELETE FROM runs
    WHERE kind IN ('evaluate', 'optimize')
      AND deck_id IS NULL
  `.execute(db);

  await sql`
    ALTER TABLE runs
    DROP CONSTRAINT IF EXISTS runs_deck_id_fkey
  `.execute(db);

  await sql`
    ALTER TABLE runs
    ADD CONSTRAINT runs_deck_id_fkey
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE runs
    DROP CONSTRAINT IF EXISTS runs_evaluate_optimize_requires_deck
  `.execute(db);

  await sql`
    ALTER TABLE runs
    ADD CONSTRAINT runs_evaluate_optimize_requires_deck
    CHECK (
      kind NOT IN ('evaluate', 'optimize')
      OR deck_id IS NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS runs_eval_pool_idx
    ON runs (
      sim_type,
      rules_version,
      sampler_version,
      card_digest,
      attribution_version,
      deck_id
    )
    WHERE status = 'complete' AND kind = 'evaluate'
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS runs_deck_id_idx
    ON runs (deck_id)
    WHERE deck_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS runs_eval_pool_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS runs_deck_id_idx`.execute(db);

  await sql`
    ALTER TABLE runs
    DROP CONSTRAINT IF EXISTS runs_evaluate_optimize_requires_deck
  `.execute(db);

  await sql`
    ALTER TABLE runs
    DROP CONSTRAINT IF EXISTS runs_deck_id_fkey
  `.execute(db);

  await sql`
    ALTER TABLE runs
    ADD CONSTRAINT runs_deck_id_fkey
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE SET NULL
  `.execute(db);
}
