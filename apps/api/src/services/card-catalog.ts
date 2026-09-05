import type { CardDef } from "@ga-fire/contracts";
import type { Kysely } from "kysely";
import type { CardsTable, Database } from "../db/types.js";

export type CatalogCard = CardDef & { aliases: string[] };

function coerceAliases(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function cardFromRow(row: CardsTable): CatalogCard {
  return {
    id: row.id,
    name: row.name,
    short: row.short,
    kind: row.kind,
    cost: row.cost,
    element: row.element,
    power: row.power,
    life: row.life,
    stealth: row.stealth,
    taunt: false,
    trueSight: false,
    unique: row.unique,
    assassinPowerBonus: row.assassin_power_bonus,
    assassinStealth: row.assassin_stealth,
    automaton: row.automaton,
    fast: row.fast,
    floatingMemory: row.floating_memory,
    kindle: row.kindle,
    prepare: row.prepare,
    aliases: coerceAliases(row.aliases),
  };
}

export async function listCatalogCards(
  db: Kysely<Database>,
): Promise<CatalogCard[]> {
  const rows = await db
    .selectFrom("cards")
    .selectAll()
    .orderBy("sort_index", "asc")
    .orderBy("id", "asc")
    .execute();
  return rows.map(cardFromRow);
}

export async function getCard(
  db: Kysely<Database>,
  id: string,
): Promise<CatalogCard | undefined> {
  const row = await db
    .selectFrom("cards")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ? cardFromRow(row) : undefined;
}

export async function getCards(db: Kysely<Database>): Promise<CatalogCard[]> {
  return listCatalogCards(db);
}

export async function replaceDeckCards(
  db: Kysely<Database>,
  deckId: string,
  counts: Record<string, number>,
): Promise<void> {
  await db.deleteFrom("deck_cards").where("deck_id", "=", deckId).execute();
  const rows = Object.entries(counts)
    .filter(([, copies]) => copies > 0)
    .map(([cardId, copies]) => ({
      deck_id: deckId,
      card_id: cardId,
      copies,
    }));
  if (rows.length === 0) {
    return;
  }
  await db.insertInto("deck_cards").values(rows).execute();
}

export async function listDecksForCard(
  db: Kysely<Database>,
  cardId: string,
): Promise<Array<{ id: string; name: string; copies: number }>> {
  return db
    .selectFrom("deck_cards")
    .innerJoin("decks", "decks.id", "deck_cards.deck_id")
    .select([
      "decks.id as id",
      "decks.name as name",
      "deck_cards.copies as copies",
    ])
    .where("deck_cards.card_id", "=", cardId)
    .orderBy("decks.name", "asc")
    .execute();
}
