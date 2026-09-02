"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  formatSignedScoreDelta,
  ratioScoreDeltaClass,
} from "./shared";

const ratioScoreMetricLabelClass =
  "font-mono text-[10px] tracking-[0.08em] text-muted uppercase";

const ratioScoreMetricValueClass =
  "font-display text-[clamp(40px,4.5vw,56px)] leading-none tabular-nums";

const ratioScoreSummaryRowClass =
  "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 gap-y-4 max-[720px]:grid-cols-1";

const ratioScoreBestDeltaGroupClass =
  "flex flex-wrap items-end gap-x-8 gap-y-4 max-[720px]:w-full";

const ratioScoreSummaryMetaClass =
  "font-mono text-[12px] tracking-[0.06em] text-muted";

const ratioScoreTopCountInputClass =
  "h-8 w-14 border border-border bg-surface px-2 text-center font-mono text-[12px] tracking-[0.02em] text-foreground tabular-nums";

type RatioScoreSummaryVariant = "search" | "multiDeck";

type RatioScoreSummaryProps = Readonly<{
  variant?: RatioScoreSummaryVariant;
  bestScore: number | null;
  baselineScore?: number | null;
  lowestScore?: number | null;
  topListCount?: number;
  maxTopListCount?: number;
  onTopListCountChange?: (value: number) => void;
  detail?: ReactNode;
}>;

export function RatioScoreSummary({
  variant = "search",
  bestScore,
  baselineScore = null,
  lowestScore = null,
  topListCount,
  maxTopListCount = 1,
  onTopListCountChange,
  detail,
}: RatioScoreSummaryProps) {
  const isMultiDeck = variant === "multiDeck";
  const delta =
    !isMultiDeck && bestScore != null && baselineScore != null
      ? bestScore - baselineScore
      : isMultiDeck && bestScore != null && lowestScore != null
        ? bestScore - lowestScore
        : null;
  const showTopListControl =
    topListCount != null && onTopListCountChange != null;

  return (
    <div className="grid gap-2 border-b border-foreground pb-5">
      <div className={ratioScoreSummaryRowClass}>
        {isMultiDeck ? (
          <div className="grid gap-1">
            <span className={ratioScoreMetricLabelClass}>Lists ranked</span>
            <strong
              className={cn(ratioScoreMetricValueClass, "text-primary-dark")}
            >
              {maxTopListCount}
            </strong>
          </div>
        ) : (
          <div className="grid gap-1">
            <span className={ratioScoreMetricLabelClass}>Baseline</span>
            <strong
              className={cn(ratioScoreMetricValueClass, "text-primary-dark")}
            >
              {baselineScore != null ? baselineScore.toFixed(2) : "—"}
            </strong>
          </div>
        )}
        <div className={ratioScoreBestDeltaGroupClass}>
          <div className="grid gap-1">
            <span className={ratioScoreMetricLabelClass}>Best score</span>
            <strong className={cn(ratioScoreMetricValueClass, "text-primary")}>
              {bestScore != null ? bestScore.toFixed(2) : "—"}
            </strong>
          </div>
          {isMultiDeck ? (
            <div className="grid gap-1">
              <span className={ratioScoreMetricLabelClass}>Lowest</span>
              <strong
                className={cn(ratioScoreMetricValueClass, "text-primary-dark")}
              >
                {lowestScore != null ? lowestScore.toFixed(2) : "—"}
              </strong>
            </div>
          ) : (
            <div className="grid gap-1">
              <span className={ratioScoreMetricLabelClass}>Delta</span>
              <strong
                className={cn(
                  ratioScoreMetricValueClass,
                  delta != null ? ratioScoreDeltaClass(delta) : "text-muted",
                )}
              >
                {delta != null ? formatSignedScoreDelta(delta) : "—"}
              </strong>
            </div>
          )}
        </div>
      </div>
      {showTopListControl ? (
        <label className={cn(ratioScoreSummaryMetaClass, "inline-flex items-center gap-2.5")}>
          <span>Top</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, maxTopListCount)}
            value={topListCount}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) {
                return;
              }
              onTopListCountChange(
                Math.min(Math.max(1, Math.round(next)), Math.max(1, maxTopListCount)),
              );
            }}
            className={ratioScoreTopCountInputClass}
            aria-label="Number of lists to show"
          />
          <span>distinct lists</span>
        </label>
      ) : (
        detail != null && (
          <small className={ratioScoreSummaryMetaClass}>{detail}</small>
        )
      )}
    </div>
  );
}
