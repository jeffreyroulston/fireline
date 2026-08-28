import type { Kysely } from "kysely";
import type { Database } from "../types.js";
import { toJsonb } from "../../lib/jsonb.js";
import { CARD_SEED } from "../card-seed.js";

export async function up(db: Kysely<Database>): Promise<void> {
  const now = new Date();
  for (const [index, card] of CARD_SEED.entries()) {
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
        sort_index: index,
        updated_at: now,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db
    .deleteFrom("cards")
    .where(
      "id",
      "in",
      CARD_SEED.map((card) => card.id),
    )
    .execute();
}
