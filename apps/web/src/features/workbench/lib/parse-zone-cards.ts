import { CARD_LIST } from "@/lib/engine";

const SHORT_TO_NAME = Object.fromEntries(
  CARD_LIST.map((card) => [card.short, card.name]),
) as Record<string, string>;

export function parseZoneCards(label: string, prefix: "MEM" | "HAND"): string[] {
  const match = label.match(new RegExp(`^${prefix}\\d+\\s*(.*)$`));
  const rest = match?.[1]?.trim() ?? "";
  if (!rest) return [];
  return rest
    .split(", ")
    .filter(Boolean)
    .map((short) => SHORT_TO_NAME[short] ?? short);
}
