import { CARDS, PLAYABLE_CARD_IDS, type CardId, type DeckCounts } from "@/lib/engine";
import { cn, buttonVariants, chipVariants } from "@/lib/utils";
import type { RatioRefineCriteria } from "../../types";

export const ratioPanelClass = "mb-7";

export const ratioRefineHintClass =
  "mb-3.5 text-[13px] leading-normal text-muted";

export const ratioCutGridClass =
  "grid grid-cols-[minmax(220px,1fr)_72px_120px] items-center gap-3 max-[620px]:grid-cols-[minmax(130px,1fr)_48px_72px]";

export function ratioReplaceChipClass(selected: boolean) {
  return cn(
    "grid gap-2 border bg-surface p-2.5 px-3",
    chipVariants({ tone: selected ? "active" : "default" }),
    selected &&
      "rounded-none bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]",
    !selected && "rounded-none",
  );
}

export const ratioRankingItemClass =
  "grid min-w-0 gap-3 border border-white/17 bg-white/[0.04] p-3.5";

export const ratioRankingHeaderClass =
  "flex items-baseline justify-between gap-2.5";

export const ratioChangesClass =
  "grid gap-2 border border-white/12 bg-white/[0.03] p-2.5 px-3";

export const ratioChangeRowClass =
  "grid grid-cols-[42px_1fr] gap-2.5 border-b border-white/12 pb-1.5 text-xs last:border-b-0 last:pb-0";

export function ratioSaveDeckClass(compact = false) {
  return cn(
    buttonVariants({ intent: "secondary" }),
    "h-[34px] border-white/35 bg-transparent px-3 text-[10px] tracking-[0.06em] text-white hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary",
    compact ? "" : "justify-self-start",
  );
}

function copyPartialCounts(
  counts: Partial<Record<CardId, number>>,
): Partial<Record<CardId, number>> {
  return { ...counts };
}

function copyDeckCounts(counts: DeckCounts): DeckCounts {
  return { ...counts };
}

export function snapshotRatioCriteria(
  baseDeckName: string,
  baseCounts: DeckCounts,
  cutBudgets: Partial<Record<CardId, number>>,
  replacements: Partial<Record<CardId, number>>,
): RatioRefineCriteria {
  return {
    baseDeckName: baseDeckName.trim() || "Base deck",
    baseCounts: copyDeckCounts(baseCounts),
    cutBudgets: copyPartialCounts(cutBudgets),
    replacements: copyPartialCounts(replacements),
  };
}

export function formatSignedCopies(delta: number): string {
  if (delta > 0) return `+${delta}×`;
  if (delta < 0) return `−${Math.abs(delta)}×`;
  return "0×";
}

export function deckDiffEntries(
  baseCounts: DeckCounts,
  nextCounts: DeckCounts,
): { id: CardId; from: number; to: number; delta: number }[] {
  const entries: { id: CardId; from: number; to: number; delta: number }[] =
    [];
  for (const id of PLAYABLE_CARD_IDS) {
    const from = baseCounts[id] ?? 0;
    const to = nextCounts[id] ?? 0;
    if (from === to) continue;
    entries.push({ id, from, to, delta: to - from });
  }
  return entries.sort((a, b) => {
    if (a.delta !== b.delta) return a.delta - b.delta;
    return CARDS[a.id].name.localeCompare(CARDS[b.id].name);
  });
}
