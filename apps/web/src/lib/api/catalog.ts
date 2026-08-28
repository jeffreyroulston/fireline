import { fetchCards } from "./client";
import { replaceCardCatalog } from "@/lib/engine/cards";
import type { CardDef, CardId, CardKind } from "@/lib/engine/types";

let hydrated = false;

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

function toCardDef(card: {
  id: string;
  name: string;
  short: string;
  kind: string;
  cost: number;
  element: string;
  power?: number | null;
  life?: number | null;
  stealth?: boolean;
  unique?: boolean;
  assassinPowerBonus?: number | null;
  assassinStealth?: boolean;
  automaton?: boolean;
  fast?: boolean;
  floatingMemory?: boolean;
  kindle?: number | null;
  prepare?: number | null;
  aliases?: string[];
}): CardDef {
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

/** Replace the bundled catalog with rows from the cards table. */
export async function hydrateCardCatalogFromApi(): Promise<void> {
  if (hydrated) {
    return;
  }
  try {
    const cards = await fetchCards();
    if (Array.isArray(cards) && cards.length > 0) {
      replaceCardCatalog(cards.map(toCardDef));
    }
    hydrated = true;
  } catch {
    // Keep the bundled catalog when the API is unavailable.
  }
}
