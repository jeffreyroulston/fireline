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

export const ratioResultsSectionClass =
  "mt-[30px] grid gap-7 border-t border-border pt-7";

export const ratioCriteriaPanelClass =
  "grid gap-3.5 border border-border bg-surface px-[18px] py-[18px]";

export const ratioResultsPanelClass =
  "grid gap-[22px] border border-border bg-surface px-[18px] py-[18px]";

export const ratioRankingItemClass =
  "grid min-w-0 gap-3 border border-border bg-surface p-3.5";

export const ratioRankingItemInteractiveClass =
  "w-full cursor-pointer text-left transition-colors hover:border-foreground/35 hover:bg-surface-muted";

export const ratioRankingBaselineItemClass =
  "border-dashed border-muted bg-[color-mix(in_srgb,var(--color-surface-muted)_55%,var(--color-surface))] hover:border-foreground/25 hover:bg-[color-mix(in_srgb,var(--color-surface-muted)_72%,var(--color-surface))]";

export const ratioRankingHeaderClass =
  "flex items-baseline justify-between gap-2.5";

export const ratioRankingPrimaryMetricClass =
  "font-display text-[32px] leading-none tabular-nums";

export const ratioChangesClass =
  "grid gap-2 border border-border bg-[color-mix(in_srgb,var(--color-surface-muted)_50%,var(--color-surface))] p-2.5 px-3";

export const ratioChangeRowClass =
  "grid grid-cols-[42px_1fr] gap-2.5 border-b border-border pb-1.5 text-xs last:border-b-0 last:pb-0";

export function ratioSaveDeckClass(compact = false) {
  return cn(
    buttonVariants({
      intent: "primary",
      size: compact ? "compact" : "default",
    }),
    "min-w-0 w-fit justify-center gap-0",
    compact ? "min-h-0" : "min-h-[42px] justify-self-start",
    "font-mono text-[10px] tracking-[0.06em] uppercase",
  );
}

export function ratioDeltaToneClass(delta: number) {
  if (delta > 0) return "[&_b]:text-primary-dark";
  if (delta < 0) return "[&_b]:text-secondary-dark";
  return "";
}

export function ratioScoreDeltaClass(delta: number) {
  if (delta > 0) return "text-primary-dark";
  if (delta < 0) return "text-secondary-dark";
  return "text-muted";
}

export function formatSignedScoreDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
}

export function findBaselineEntry<
  T extends { counts: DeckCounts; score: number },
>(top: readonly T[], baseCounts: DeckCounts): T | null {
  for (const entry of top) {
    if (deckDiffEntries(baseCounts, entry.counts).length === 0) {
      return entry;
    }
  }
  return null;
}

export function findBestChangedEntry<
  T extends { counts: DeckCounts; score: number },
>(top: readonly T[], baseCounts: DeckCounts): T | null {
  let best: T | null = null;
  for (const entry of top) {
    if (deckDiffEntries(baseCounts, entry.counts).length === 0) {
      continue;
    }
    if (!best || entry.score > best.score) {
      best = entry;
    }
  }
  return best;
}

export function isSameDeckCounts(left: DeckCounts, right: DeckCounts): boolean {
  return deckDiffEntries(left, right).length === 0;
}

export function deckCountsTotal(counts: DeckCounts): number {
  return Object.values(counts).reduce((sum, copies) => sum + copies, 0);
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
