import type { CatalogLookup } from "./deck.js";
import {
  catalogTokenIndex,
  deckHash,
  parseDeckText,
  resolveCatalogToken,
} from "./deck.js";

export { deckHash as materialDeckHash };

export type MaterialCatalogLookup = CatalogLookup & { kind: string };

export function materialCatalogTokenIndex(
  cards: MaterialCatalogLookup[],
): Map<string, string> {
  const materialCards = cards.filter((card) => card.kind === "material");
  return catalogTokenIndex(materialCards);
}

export type MaterialParseIssue =
  | { kind: "unrecognized"; line: string }
  | { kind: "not_material"; line: string; cardId: string }
  | { kind: "too_many_copies"; line: string; cardId: string; qty: number }
  | { kind: "empty" };

export function parseMaterialDeckText(
  text: string,
  materialIndex: Map<string, string>,
  allIndex: Map<string, string>,
): { counts: Record<string, number>; issues: MaterialParseIssue[] } {
  const counts: Record<string, number> = {};
  const issues: MaterialParseIssue[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^(materials?|main\s*deck|maindeck|sideboard|side\s*board)\b/i.test(trimmed)) {
      continue;
    }

    let qty = 1;
    let token = trimmed;
    const countMatch =
      trimmed.match(/^(\d+)\s*×\s*(.+)$/) ||
      trimmed.match(/^(\d+)x\s*(.+)$/i) ||
      trimmed.match(/^(\d+)\s+(.+)$/);
    if (countMatch) {
      qty = parseInt(countMatch[1], 10);
      token = countMatch[2];
    }

    const materialId = resolveCatalogToken(token, materialIndex);
    if (materialId) {
      if (qty > 1) {
        issues.push({
          kind: "too_many_copies",
          line: trimmed,
          cardId: materialId,
          qty,
        });
        continue;
      }
      counts[materialId] = (counts[materialId] ?? 0) + qty;
      if (counts[materialId] > 1) {
        issues.push({
          kind: "too_many_copies",
          line: trimmed,
          cardId: materialId,
          qty: counts[materialId],
        });
        counts[materialId] = 1;
      }
      continue;
    }

    const anyId = resolveCatalogToken(token, allIndex);
    if (anyId) {
      issues.push({ kind: "not_material", line: trimmed, cardId: anyId });
    } else {
      issues.push({ kind: "unrecognized", line: trimmed });
    }
  }

  if (Object.keys(counts).length === 0 && issues.length === 0) {
    issues.push({ kind: "empty" });
  }

  return { counts, issues };
}

export function formatMaterialParseIssues(issues: MaterialParseIssue[]): string[] {
  return issues.map((issue) => {
    switch (issue.kind) {
      case "unrecognized":
        return `Unrecognized material: ${issue.line}`;
      case "not_material":
        return `Not a material card: ${issue.line}`;
      case "too_many_copies":
        return `Material decks allow at most 1 copy: ${issue.line}`;
      case "empty":
        return "Material deck needs at least one recognized material card.";
    }
  });
}

export function buildMaterialIndexes(cards: MaterialCatalogLookup[]) {
  const allIndex = catalogTokenIndex(cards);
  const materialIndex = materialCatalogTokenIndex(cards);
  return { allIndex, materialIndex };
}

export function parseAndValidateMaterialDeck(
  text: string,
  cards: MaterialCatalogLookup[],
): { counts: Record<string, number>; issues: MaterialParseIssue[] } {
  const { allIndex, materialIndex } = buildMaterialIndexes(cards);
  return parseMaterialDeckText(text, materialIndex, allIndex);
}

export function materialCountsHash(counts: Record<string, number>): string {
  return deckHash(counts);
}
