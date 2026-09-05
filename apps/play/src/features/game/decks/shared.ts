import {
  CARDS,
  MATERIAL_NAMES,
  isMaterialId,
  type CardDef,
  type CardId,
  type MaterialId,
} from "@ga-fire/game";

export function tallyCards(cards: CardId[]): { id: CardId; qty: number }[] {
  const counts = new Map<CardId, number>();
  for (const id of cards) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, qty]) => ({ id, qty }))
    .sort((a, b) => {
      const nameA = CARDS[a.id]?.name ?? a.id;
      const nameB = CARDS[b.id]?.name ?? b.id;
      return nameA.localeCompare(nameB);
    });
}

export function resolveDeckCard(id: CardId | MaterialId): CardDef | null {
  const fromCatalog = CARDS[id];
  if (fromCatalog) return fromCatalog;
  if (!isMaterialId(id)) return null;
  return {
    id: id as CardId,
    name: MATERIAL_NAMES[id],
    short: MATERIAL_NAMES[id].slice(0, 5),
    kind: "material",
    cost: 0,
    element: "norm",
  };
}
