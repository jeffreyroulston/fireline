import type { Kysely } from "kysely";
import type { Database } from "../types.js";

function coerceCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const counts: Record<string, number> = {};
  for (const [cardId, copies] of Object.entries(value)) {
    if (typeof copies === "number" && copies > 0) {
      counts[cardId] = copies;
    }
  }
  return counts;
}

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("deck_cards")
    .addColumn("deck_id", "uuid", (col) =>
      col.notNull().references("decks.id").onDelete("cascade"),
    )
    .addColumn("card_id", "text", (col) =>
      col.notNull().references("cards.id").onDelete("restrict"),
    )
    .addColumn("copies", "smallint", (col) => col.notNull())
    .addPrimaryKeyConstraint("deck_cards_pkey", ["deck_id", "card_id"])
    .execute();

  await db.schema
    .createIndex("deck_cards_card_id_idx")
    .on("deck_cards")
    .column("card_id")
    .execute();

  const cardIds = new Set(
    (await db.selectFrom("cards").select("id").execute()).map((row) => row.id),
  );
  const decks = await db.selectFrom("decks").select(["id", "counts"]).execute();
  const rows = decks.flatMap((deck) =>
    Object.entries(coerceCounts(deck.counts))
      .filter(([cardId]) => cardIds.has(cardId))
      .map(([cardId, copies]) => ({
        deck_id: deck.id,
        card_id: cardId,
        copies,
      })),
  );
  if (rows.length > 0) {
    await db.insertInto("deck_cards").values(rows).execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("deck_cards").ifExists().execute();
}
