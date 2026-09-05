import type { CardDef, CardId, CardKind } from "./types";
import {
  BUNDLED_CARD_DIGEST,
  catalogDigestMismatch,
  replaceCardCatalog,
} from "./cards";

export type ApiCardRow = {
  id: string;
  name: string;
  short: string;
  kind: string;
  cost: number;
  element: string;
  power?: number | null;
  life?: number | null;
  stealth?: boolean;
  taunt?: boolean;
  trueSight?: boolean;
  unique?: boolean;
  assassinPowerBonus?: number | null;
  assassinStealth?: boolean;
  automaton?: boolean;
  fast?: boolean;
  floatingMemory?: boolean;
  kindle?: number | null;
  prepare?: number | null;
  aliases?: string[];
};

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
    ...(card.taunt ? { taunt: true } : {}),
    ...(card.trueSight ? { trueSight: true } : {}),
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

export type CatalogAlignResult = {
  matched: boolean;
  hydrated: boolean;
  engineDigest: string | null;
  bundledDigest: string;
};

/**
 * If the live engine digest differs from the image bundle, replace the mutable
 * catalog from API `/cards` rows (display/payment helpers). Rules still come
 * from the worker.
 */
export function alignCatalogWithEngine(options: {
  engineCardDigest: string | null | undefined;
  cards: ApiCardRow[];
}): CatalogAlignResult {
  const engineDigest =
    options.engineCardDigest != null && options.engineCardDigest !== ""
      ? String(options.engineCardDigest)
      : null;
  const matched = !catalogDigestMismatch(engineDigest);
  if (!matched && options.cards.length > 0) {
    replaceCardCatalog(options.cards.map(toCardDef));
    return {
      matched: false,
      hydrated: true,
      engineDigest,
      bundledDigest: BUNDLED_CARD_DIGEST,
    };
  }
  return {
    matched,
    hydrated: false,
    engineDigest,
    bundledDigest: BUNDLED_CARD_DIGEST,
  };
}
