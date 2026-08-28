import type { Kysely } from "kysely";
import type { Database } from "../types.js";
import { toJsonb } from "../../lib/jsonb.js";
import { CARD_SEED } from "../card-seed.js";

const CARD = CARD_SEED.find((entry) => entry.id === "flagrant_guide");

export async function up(db: Kysely<Database>): Promise<void> {
  if (!CARD) {
    return;
  }
  const now = new Date();
  const sortIndex = CARD_SEED.findIndex((entry) => entry.id === CARD.id);
  await db
    .insertInto("cards")
    .values({
      id: CARD.id,
      name: CARD.name,
      short: CARD.short,
      kind: CARD.kind,
      cost: CARD.cost,
      element: CARD.element,
      power: CARD.power ?? null,
      life: CARD.life ?? null,
      stealth: CARD.stealth ?? false,
      unique: CARD.unique ?? false,
      assassin_power_bonus: CARD.assassinPowerBonus ?? null,
      assassin_stealth: CARD.assassinStealth ?? false,
      automaton: CARD.automaton ?? false,
      fast: CARD.fast ?? false,
      floating_memory: CARD.floatingMemory ?? false,
      kindle: CARD.kindle ?? null,
      prepare: CARD.prepare ?? null,
      aliases: toJsonb(CARD.aliases),
      sort_index: sortIndex,
      updated_at: now,
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  if (!CARD) {
    return;
  }
  await db.deleteFrom("cards").where("id", "=", CARD.id).execute();
}
