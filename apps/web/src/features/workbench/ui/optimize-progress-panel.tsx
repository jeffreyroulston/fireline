"use client";

import type { OptimizeProgress } from "@/lib/api/useRun";
import {
  handProgressPercent,
  progressPercent,
  rolloutProgressPercent,
} from "../lib/progress-percent";

function resolveRolloutTotal(
  progress: OptimizeProgress | null | undefined,
  monteCarloRollouts?: number,
): number {
  return progress?.totalRollouts ?? monteCarloRollouts ?? 0;
}

function ProgressBar({
  percent,
  started,
  trackClassName,
}: {
  percent: number;
  started?: boolean;
  trackClassName?: string;
}) {
  const indeterminate = percent <= 0 && !started;
  return (
    <div className={trackClassName ?? "progress-track"}>
      <span
        className={indeterminate ? "is-indeterminate" : undefined}
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
  const totalRollouts = resolveRolloutTotal(progress, monteCarloRollouts);
  const showRollouts =
    (monteCarloRollouts ?? 0) > 1 || (progress?.totalRollouts ?? 0) > 1;
  const handsPercent = showRollouts
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
      className="progress-panel"
      role="status"
      aria-label={`${ariaPercent}% complete`}
    >
      <div className="progress-row">
        <div className="progress-meta">
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
          {legalDecks > 0 && (
            <span>{legalDecks.toLocaleString()} legal</span>
          )}
          {showDecks && (
            <span>best {(progress?.bestScore ?? 0).toFixed(2)}</span>
          )}
        </div>
        <ProgressBar
          percent={handsPercent}
          started={progress?.started}
        />
      </div>
      {showRollouts && (
        <div className="progress-row">
          <div className="progress-meta">
            <span>
              {(progress?.rolloutsDone ?? 0).toLocaleString()} /{" "}
              {totalRollouts.toLocaleString()} rollouts
            </span>
          </div>
          <ProgressBar
            percent={rolloutsPercent}
            started={
              progress?.started &&
              ((progress.handsSimulated ?? 0) < (progress.totalHands ?? 0) ||
                (progress.rolloutsDone ?? 0) > 0)
            }
            trackClassName="progress-track progress-track-rollout"
          />
        </div>
      )}
    </div>
  );
}
