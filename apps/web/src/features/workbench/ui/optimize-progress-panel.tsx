"use client";

import type { OptimizeProgress } from "@/lib/api/useRun";
import { cn } from "@/lib/utils/cn";
import {
  aggregateRollouts,
  handProgressPercent,
  progressPercent,
  rolloutProgressPercent,
} from "../lib/progress-percent";
import { HandProgressBars } from "./hand-progress-bars";

function resolveRolloutTotal(
  progress: OptimizeProgress | null | undefined,
  monteCarloRollouts?: number,
): number {
  return progress?.totalRollouts ?? monteCarloRollouts ?? 0;
}

function ProgressBar({
  percent,
  rollout,
}: {
  percent: number;
  rollout?: boolean;
}) {
  // Keep the slide animation while still at 0%. Tying it to !started made the
  // bar look frozen for the whole first MC hand (parallel path only bumps
  // handsSimulated when a hand finishes).
  const indeterminate = percent <= 0;
  return (
    <div className="h-1 w-full overflow-hidden bg-border">
      <span
        className={cn(
          "block h-full bg-primary transition-[width] duration-[180ms] ease-in-out",
          rollout && "bg-accent",
          indeterminate &&
            "w-[28%] animate-[progress-indeterminate_1.15s_ease-in-out_infinite] [transform:translateX(-120%)]",
        )}
        style={indeterminate ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
}

export function OptimizeProgressPanel({
  progress,
  percent,
  monteCarloRollouts,
}: {
  progress?: OptimizeProgress | null;
  percent?: number;
  /** Deck-damage MC runs: keep the rollout bar visible for the whole job. */
  monteCarloRollouts?: number;
}) {
  const hands = progress?.hands;
  const showHandBars = (hands?.length ?? 0) > 0;
  const totalRollouts = resolveRolloutTotal(progress, monteCarloRollouts);
  const jobRollouts = aggregateRollouts(progress, totalRollouts);
  const showRollouts =
    !showHandBars &&
    !jobRollouts &&
    ((monteCarloRollouts ?? 0) > 1 || (progress?.totalRollouts ?? 0) > 1);
  const handsPercent = showRollouts || showHandBars
    ? handProgressPercent(progress)
    : (percent ?? progressPercent(progress));
  const rolloutsPercent = showRollouts
    ? rolloutProgressPercent(progress, totalRollouts)
    : 0;
  const legalDecks = progress?.legalDecks ?? 0;
  const showDecks = (progress?.totalDecks ?? 0) > 0;
  const ariaPercent = showRollouts
    ? Math.round((handsPercent + rolloutsPercent) / 2)
    : handsPercent;

  return (
    <div
      className="grid w-full min-w-0 gap-2.5"
      role="status"
      aria-label={`${ariaPercent}% complete`}
    >
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap gap-x-[18px] gap-y-2 font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
          {showDecks && (
            <span>
              {(progress?.decksScored ?? 0).toLocaleString()} /{" "}
              {(progress?.totalDecks ?? 0).toLocaleString()} decks
            </span>
          )}
          <span>
            {(progress?.handsSimulated ?? 0).toLocaleString()} /{" "}
            {(progress?.totalHands ?? 0).toLocaleString()} hands
          </span>
          {jobRollouts && (
            <span>
              {jobRollouts.done.toLocaleString()} /{" "}
              {jobRollouts.total.toLocaleString()} rollouts
            </span>
          )}
          {legalDecks > 0 && (
            <span>{legalDecks.toLocaleString()} legal</span>
          )}
          {showDecks && (
            <span>best {(progress?.bestScore ?? 0).toFixed(2)}</span>
          )}
        </div>
        <ProgressBar percent={handsPercent} />
      </div>
      {showHandBars && <HandProgressBars hands={hands} />}
      {showRollouts && (
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap gap-x-[18px] gap-y-2 font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
            <span>
              {(progress?.rolloutsDone ?? 0).toLocaleString()} /{" "}
              {totalRollouts.toLocaleString()} rollouts
            </span>
          </div>
          <ProgressBar percent={rolloutsPercent} rollout />
        </div>
      )}
    </div>
  );
}
