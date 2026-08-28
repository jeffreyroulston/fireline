import { sql, type Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("cards")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("short", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("cost", "smallint", (col) => col.notNull())
    .addColumn("element", "text", (col) => col.notNull())
    .addColumn("power", "smallint")
    .addColumn("life", "smallint")
    .addColumn("stealth", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("unique", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("assassin_power_bonus", "smallint")
    .addColumn("assassin_stealth", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("automaton", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("fast", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("floating_memory", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("kindle", "smallint")
    .addColumn("prepare", "smallint")
    .addColumn("aliases", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("sort_index", "smallint", (col) => col.notNull().defaultTo(0))
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("cards").ifExists().execute();
}
