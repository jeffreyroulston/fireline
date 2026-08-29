import { replaceCardCatalog } from "@/lib/engine/cards";
import type { CardDef, CardId, CardKind } from "@/lib/engine/types";
import type { ApiCardRow } from "./shared";

function isCardKind(value: string): value is CardKind {
  return (
    value === "ally" ||
    value === "attack" ||
    value === "action" ||
    value === "item" ||
    value === "brick" ||
    value === "material"
  );
}

export function toCardDef(card: ApiCardRow): CardDef {
  return {
    id: card.id as CardId,
    name: card.name,
    short: card.short,
    kind: isCardKind(card.kind) ? card.kind : "action",
    cost: card.cost,
    element: card.element === "fire" ? "fire" : "norm",
    ...(card.power != null ? { power: card.power } : {}),
    ...(card.life != null ? { life: card.life } : {}),
    ...(card.stealth ? { stealth: true } : {}),
    ...(card.unique ? { unique: true } : {}),
    ...(card.assassinPowerBonus != null
      ? { assassinPowerBonus: card.assassinPowerBonus }
      : {}),
    ...(card.assassinStealth ? { assassinStealth: true } : {}),
    ...(card.automaton ? { automaton: true } : {}),
    ...(card.fast ? { fast: true } : {}),
    ...(card.floatingMemory ? { floatingMemory: true } : {}),
    ...(card.kindle != null ? { kindle: card.kindle } : {}),
    ...(card.prepare != null ? { prepare: card.prepare } : {}),
    aliases: card.aliases ?? [],
  };
}

/** Replace the bundled catalog with API rows (pure — no module singleton). */
export function hydrateCatalog(cards: ApiCardRow[]): void {
  if (cards.length > 0) {
    replaceCardCatalog(cards.map(toCardDef));
  }
}
