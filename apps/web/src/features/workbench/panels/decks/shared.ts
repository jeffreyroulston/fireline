import { CARDS, isMaterialId, MATERIAL_NAMES } from "@/lib/engine";
import type { CardDef, CardId, MaterialId } from "@/lib/engine/types";

export const CARD_PREVIEW_DELAY_MS = 450;
export const CARD_PREVIEW_WIDTH = 312;
export const CARD_PREVIEW_MARGIN = 12;

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

export function cardTraitLines(card: CardDef): string[] {
  const traits: string[] = [];
  if (card.unique) traits.push("Unique");
  if (card.stealth) traits.push("Stealth");
  if (card.floatingMemory) traits.push("Floating Memory");
  if (card.assassinPowerBonus) {
    traits.push(`Assassin +${card.assassinPowerBonus} power`);
  }
  if (card.assassinStealth) traits.push("Assassin Stealth");
  if (card.automaton) traits.push("Automaton");
  if (card.fast) traits.push("Fast");
  if (card.kindle) traits.push(`Kindle ${card.kindle}`);
  if (card.prepare) traits.push(`Prepare ${card.prepare}`);
  return traits;
}

export function clampPreviewPosition(
  anchor: DOMRect,
  previewWidth: number,
  previewHeight: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = CARD_PREVIEW_MARGIN;
  const maxLeft = Math.max(margin, vw - previewWidth - margin);
  const maxTop = Math.max(margin, vh - previewHeight - margin);

  const preferRight = vw - anchor.right >= previewWidth + margin * 2;
  let left = preferRight
    ? anchor.right + margin
    : anchor.left - previewWidth - margin;
  left = Math.min(Math.max(margin, left), maxLeft);

  let top = anchor.top;
  top = Math.min(Math.max(margin, top), maxTop);

  return { top, left };
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
