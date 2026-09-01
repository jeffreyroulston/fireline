"use client";

import type { DeckCounts } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { RatioChangeCards } from "./ratio-change-cards";
import {
  deckDiffEntries,
  formatSignedScoreDelta,
  ratioRankingBaselineItemClass,
  ratioRankingHeaderClass,
  ratioRankingItemClass,
  ratioRankingItemInteractiveClass,
  ratioRankingPrimaryMetricClass,
  ratioScoreDeltaClass,
} from "./shared";

export type RatioRankingRowEntry = Readonly<{
  rank: number;
  score: number;
  counts: DeckCounts;
}>;

type RatioRankingVariant = "search" | "multiDeck";

type RatioRankingRowProps = Readonly<{
  entry: RatioRankingRowEntry;
  baseCounts: DeckCounts;
  baseDeckName?: string;
  baselineScore?: number | null;
  bestScore?: number | null;
  variant?: RatioRankingVariant;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}>;

export function RatioRankingRow({
  entry,
  baseCounts,
  baseDeckName,
  baselineScore = null,
  bestScore = null,
  variant = "search",
  interactive = false,
  onClick,
  className,
}: RatioRankingRowProps) {
  const isMultiDeck = variant === "multiDeck";
  const changes = deckDiffEntries(baseCounts, entry.counts);
  const isBaseline = !isMultiDeck && changes.length === 0;
  const delta = isMultiDeck
    ? bestScore != null && entry.rank > 1
      ? entry.score - bestScore
      : null
    : !isBaseline && baselineScore != null
      ? entry.score - baselineScore
      : null;

  const content = (
    <>
      <header className={ratioRankingHeaderClass}>
        <div className="grid gap-0.5">
          <span
            className={cn(
              ratioRankingPrimaryMetricClass,
              isBaseline ? "text-primary-dark" : "text-muted",
            )}
          >
            {isBaseline
              ? baseDeckName?.trim() || "Baseline"
              : `#${entry.rank}`}
          </span>
          {isBaseline && !baseDeckName?.trim() && (
            <span className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
              Current base decklist
            </span>
          )}
        </div>
        <div className="grid justify-items-end gap-0.5">
          {isBaseline ? (
            <strong
              className={cn(ratioRankingPrimaryMetricClass, "text-primary-dark")}
            >
              {entry.score.toFixed(2)}
            </strong>
          ) : isMultiDeck ? (
            <>
              <strong
                className={cn(ratioRankingPrimaryMetricClass, "text-primary-dark")}
              >
                {entry.score.toFixed(2)}
              </strong>
              {delta != null && (
                <span
                  className={cn(
                    "font-mono text-[13px] tracking-[0.02em] tabular-nums",
                    ratioScoreDeltaClass(delta),
                  )}
                >
                  {formatSignedScoreDelta(delta)} vs best
                </span>
              )}
            </>
          ) : (
            <>
              <strong
                className={cn(
                  ratioRankingPrimaryMetricClass,
                  delta != null ? ratioScoreDeltaClass(delta) : "text-muted",
                )}
              >
                {delta != null ? formatSignedScoreDelta(delta) : "—"}
              </strong>
              <span className="font-mono text-[13px] tracking-[0.02em] text-muted tabular-nums">
                {entry.score.toFixed(2)}
              </span>
            </>
          )}
        </div>
      </header>
      {!isBaseline && !isMultiDeck && (
        <RatioChangeCards
          changes={changes}
          className={interactive ? "pointer-events-none" : undefined}
        />
      )}
    </>
  );

  const rowClassName = cn(
    ratioRankingItemClass,
    interactive && ratioRankingItemInteractiveClass,
    isBaseline && ratioRankingBaselineItemClass,
    className,
  );

  if (interactive) {
    return (
      <button type="button" className={rowClassName} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className={rowClassName}>{content}</article>;
}
