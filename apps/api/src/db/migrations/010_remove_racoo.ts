import { sql, type Kysely } from "kysely";
import type { Database } from "../types.js";

/** Remove non-card Racoo and clean dependent rows. */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`DELETE FROM run_sample_events WHERE card_id = 'racoo' OR drawn_id = 'racoo' OR discarded_id = 'racoo'`.execute(
    db,
  );
  await sql`DELETE FROM run_sample_card_stats WHERE card_id = 'racoo'`.execute(db);
  await sql`DELETE FROM run_card_stats WHERE card_id = 'racoo'`.execute(db);
  await sql`DELETE FROM deck_cards WHERE card_id = 'racoo'`.execute(db);
  await sql`DELETE FROM cards WHERE id = 'racoo'`.execute(db);
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // Racoo is not restored; re-seed from CARD_SEED if needed.
}
