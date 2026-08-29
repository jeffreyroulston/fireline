import type { Kysely } from "kysely";
import type { Database } from "../types.js";
import { toJsonb } from "../../lib/jsonb.js";
import { CARD_SEED, MATERIAL_SEED } from "../card-seed.js";

const CARDS = MATERIAL_SEED.filter((entry) =>
  ["assassins_ripper", "grand_crusaders_ring"].includes(entry.id),
);

export async function up(db: Kysely<Database>): Promise<void> {
  const now = new Date();
  for (const card of CARDS) {
    const sortIndex =
      CARD_SEED.length +
      MATERIAL_SEED.findIndex((entry) => entry.id === card.id);
    await db
      .insertInto("cards")
      .values({
        id: card.id,
        name: card.name,
        short: card.short,
        kind: card.kind,
        cost: card.cost,
        element: card.element,
        power: card.power ?? null,
        life: card.life ?? null,
        stealth: card.stealth ?? false,
        unique: card.unique ?? false,
        assassin_power_bonus: card.assassinPowerBonus ?? null,
        assassin_stealth: card.assassinStealth ?? false,
        automaton: card.automaton ?? false,
        fast: card.fast ?? false,
        floating_memory: card.floatingMemory ?? false,
        kindle: card.kindle ?? null,
        prepare: card.prepare ?? null,
        aliases: toJsonb(card.aliases),
        sort_index: sortIndex,
        updated_at: now,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const card of CARDS) {
    await db.deleteFrom("cards").where("id", "=", card.id).execute();
  }
}
