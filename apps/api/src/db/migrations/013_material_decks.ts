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
    .createTable("material_decks")
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
    .createIndex("material_decks_material_hash_idx")
    .on("material_decks")
    .column("material_hash")
    .execute();

  const standardId = randomUUID();
  const now = new Date();
  await db
    .insertInto("material_decks")
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
    .alterTable("decks")
    .addColumn("material_deck_id", "uuid", (col) =>
      col.references("material_decks.id").onDelete("restrict"),
    )
    .execute();

  await db
    .updateTable("decks")
    .set({ material_deck_id: standardId })
    .where("material_deck_id", "is", null)
    .execute();

  await db.schema
    .alterTable("decks")
    .alterColumn("material_deck_id", (col) => col.setNotNull())
    .execute();

  await db.schema
    .alterTable("runs")
    .addColumn("material_deck_id", "uuid", (col) =>
      col.references("material_decks.id").onDelete("set null"),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("runs")
    .dropColumn("material_deck_id")
    .execute();
  await db.schema
    .alterTable("decks")
    .dropColumn("material_deck_id")
    .execute();
  await db.schema.dropTable("material_decks").ifExists().execute();
}
