"use client";

import type { OptimizeProgress } from "@/lib/api/useRun";
import { progressPercent } from "../lib/progress-percent";

export function OptimizeProgressPanel({
  progress,
  percent,
}: {
  progress?: OptimizeProgress | null;
  percent?: number;
}) {
  const resolved = percent ?? progressPercent(progress);
  const legalDecks = progress?.legalDecks ?? 0;
  const showDecks = (progress?.totalDecks ?? 0) > 0;
  const totalRollouts = progress?.totalRollouts ?? 0;
  const showRollouts = totalRollouts > 1;
  return (
    <div
      className="progress-panel"
      role="status"
      aria-label={`${resolved}% complete`}
    >
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
        {showRollouts && (
          <span>
            {(progress?.rolloutsDone ?? 0).toLocaleString()} /{" "}
            {totalRollouts.toLocaleString()} rollouts
          </span>
        )}
        {legalDecks > 0 && (
          <span>{legalDecks.toLocaleString()} legal</span>
        )}
        {showDecks && (
          <span>best {(progress?.bestScore ?? 0).toFixed(2)}</span>
        )}
      </div>
      <div className="progress-track">
        <span
          className={resolved <= 0 ? "is-indeterminate" : undefined}
          style={resolved <= 0 ? undefined : { width: `${resolved}%` }}
        />
      </div>
    </div>
  );
}
