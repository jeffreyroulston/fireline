import { sql, type Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  // Dev-only wipe: English Step tapes are discarded; no dual-read.
  await sql`DELETE FROM runs`.execute(db);

  await db.schema
    .alterTable("run_samples")
    .dropColumn("steps")
    .execute();

  await db.schema
    .createTable("run_sample_events")
    .addColumn("sample_id", "uuid", (col) =>
      col.notNull().references("run_samples.id").onDelete("cascade"),
    )
    .addColumn("seq", "smallint", (col) => col.notNull())
    .addColumn("action_index", "smallint", (col) => col.notNull())
    .addColumn("op", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("card_id", "text", (col) =>
      col.references("cards.id").onDelete("restrict"),
    )
    .addColumn("drawn_id", "text", (col) =>
      col.references("cards.id").onDelete("restrict"),
    )
    .addColumn("discarded_id", "text", (col) =>
      col.references("cards.id").onDelete("restrict"),
    )
    .addColumn("payload", "jsonb", (col) => col.notNull())
    .addPrimaryKeyConstraint("run_sample_events_pkey", ["sample_id", "seq"])
    .execute();

  await db.schema
    .createIndex("run_sample_events_card_id_idx")
    .on("run_sample_events")
    .column("card_id")
    .execute();

  await db.schema
    .createIndex("run_sample_events_kind_card_id_idx")
    .on("run_sample_events")
    .columns(["kind", "card_id"])
    .execute();

  await db.schema
    .createTable("run_sample_card_stats")
    .addColumn("sample_id", "uuid", (col) =>
      col.notNull().references("run_samples.id").onDelete("cascade"),
    )
    .addColumn("card_id", "text", (col) =>
      col.notNull().references("cards.id").onDelete("restrict"),
    )
    .addColumn("plays", "integer", (col) => col.notNull())
    .addColumn("attacks", "integer", (col) => col.notNull())
    .addColumn("damage", "integer", (col) => col.notNull())
    .addColumn("drawn", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("run_sample_card_stats_pkey", [
      "sample_id",
      "card_id",
    ])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("run_sample_card_stats").ifExists().execute();
  await db.schema.dropTable("run_sample_events").ifExists().execute();
  await db.schema
    .alterTable("run_samples")
    .addColumn("steps", "jsonb")
    .execute();
}
