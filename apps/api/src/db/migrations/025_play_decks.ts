import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Database } from "../types.js";
import { toJsonb } from "../../lib/jsonb.js";
import { deckHash } from "../../lib/deck.js";

const STANDARD_MATERIALS_TEXT = `1 Impact Hammer
1 Mercenary's Blade
1 Poisoned Dagger
1 Zander, Prepared Scout
1 Varuckan Soulknife`;

const STANDARD_COUNTS: Record<string, number> = {
  impact_hammer: 1,
  mercenary_blade: 1,
  poisoned_dagger: 1,
  zander_1: 1,
  varuckan_soulknife: 1,
};

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("play_material_decks")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("counts", "jsonb", (col) => col.notNull())
    .addColumn("material_hash", "text", (col) => col.notNull())
    .addColumn("is_system", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("play_material_decks_material_hash_idx")
    .on("play_material_decks")
    .column("material_hash")
    .execute();

  const standardId = randomUUID();
  const now = new Date();
  await db
    .insertInto("play_material_decks")
    .values({
      id: standardId,
      name: "Standard materials",
      text: STANDARD_MATERIALS_TEXT,
      counts: toJsonb(STANDARD_COUNTS),
      material_hash: deckHash(STANDARD_COUNTS),
      is_system: true,
      created_at: now,
      updated_at: now,
    })
    .execute();

  await db.schema
    .createTable("play_decks")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("counts", "jsonb", (col) => col.notNull())
    .addColumn("deck_hash", "text", (col) => col.notNull())
    .addColumn("material_deck_id", "uuid", (col) =>
      col.notNull().references("play_material_decks.id").onDelete("restrict"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("play_decks_deck_hash_idx")
    .on("play_decks")
    .column("deck_hash")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("play_decks").ifExists().execute();
  await db.schema.dropTable("play_material_decks").ifExists().execute();
}
