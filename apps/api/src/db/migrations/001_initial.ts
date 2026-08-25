import { sql, type Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("decks")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("counts", "jsonb", (col) => col.notNull())
    .addColumn("deck_hash", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex("decks_deck_hash_idx").on("decks").column("deck_hash").execute();

  await db.schema
    .createTable("runs")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("sim_type", "text")
    .addColumn("root_seed", "bigint")
    .addColumn("deck_hash", "text")
    .addColumn("deck_id", "uuid", (col) => col.references("decks.id").onDelete("set null"))
    .addColumn("deck_counts", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("go_first", "boolean")
    .addColumn("max_turns", "smallint")
    .addColumn("rollouts", "smallint")
    .addColumn("samples", "smallint")
    .addColumn("budget", "jsonb")
    .addColumn("metric", "text")
    .addColumn("bounds", "jsonb")
    .addColumn("deck_size", "smallint")
    .addColumn("decks_requested", "integer")
    .addColumn("rules_version", "integer")
    .addColumn("sampler_version", "integer")
    .addColumn("attribution_version", "integer")
    .addColumn("card_digest", "text")
    .addColumn("build", "text")
    .addColumn("started_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("completed_at", "timestamptz")
    .addColumn("elapsed_ms", "double precision")
    .addColumn("error_message", "text")
    .addColumn("mean_damage", "double precision")
    .addColumn("p50_damage", "smallint")
    .addColumn("p90_damage", "smallint")
    .addColumn("max_damage", "smallint")
    .addColumn("min_damage", "smallint")
    .addColumn("best_score", "double precision")
    .addColumn("damage_histogram", "jsonb")
    .addColumn("optimize_history", "jsonb")
    .addColumn("request_body", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();

  await db.schema.createIndex("runs_status_idx").on("runs").column("status").execute();
  await db.schema.createIndex("runs_deck_hash_idx").on("runs").column("deck_hash").execute();

  await db.schema
    .createTable("run_samples")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("run_id", "uuid", (col) => col.notNull().references("runs.id").onDelete("cascade"))
    .addColumn("hand_hash", "text", (col) => col.notNull())
    .addColumn("card_ids", "jsonb", (col) => col.notNull())
    .addColumn("occurrence_count", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("damage", "smallint", (col) => col.notNull())
    .addColumn("nodes", "bigint", (col) => col.notNull())
    .addColumn("steps", "jsonb")
    .execute();

  await db.schema
    .createIndex("run_samples_run_id_idx")
    .on("run_samples")
    .column("run_id")
    .execute();

  await db.schema
    .createTable("run_card_stats")
    .addColumn("run_id", "uuid", (col) => col.notNull().references("runs.id").onDelete("cascade"))
    .addColumn("card_id", "text", (col) => col.notNull())
    .addColumn("copies", "smallint", (col) => col.notNull())
    .addColumn("opened", "integer", (col) => col.notNull())
    .addColumn("opened_copies", "integer", (col) => col.notNull())
    .addColumn("drawn", "integer", (col) => col.notNull())
    .addColumn("seen", "integer", (col) => col.notNull())
    .addColumn("plays", "integer", (col) => col.notNull())
    .addColumn("attacks", "integer", (col) => col.notNull())
    .addColumn("damage", "integer", (col) => col.notNull())
    .addColumn("damage_when_seen_sum", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("run_card_stats_pkey", ["run_id", "card_id"])
    .execute();

  await db.schema
    .createTable("run_candidates")
    .addColumn("run_id", "uuid", (col) => col.notNull().references("runs.id").onDelete("cascade"))
    .addColumn("rank", "smallint", (col) => col.notNull())
    .addColumn("score", "double precision", (col) => col.notNull())
    .addColumn("counts", "jsonb", (col) => col.notNull())
    .addColumn("deck_hash", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("run_candidates_pkey", ["run_id", "rank"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("run_candidates").ifExists().execute();
  await db.schema.dropTable("run_card_stats").ifExists().execute();
  await db.schema.dropTable("run_samples").ifExists().execute();
  await db.schema.dropTable("runs").ifExists().execute();
  await db.schema.dropTable("decks").ifExists().execute();
}
