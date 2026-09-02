import { sql, type Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS runs_settings_pool_idx
    ON runs (
      sim_type,
      rules_version,
      sampler_version,
      attribution_version,
      go_first,
      max_turns
    )
    WHERE status IN ('complete', 'partial')
      AND kind IN ('evaluate', 'optimize')
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS runs_settings_pool_idx`.execute(db);
}
