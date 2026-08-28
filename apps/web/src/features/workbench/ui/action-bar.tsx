"use client";

import type { OptimizeProgress } from "@/lib/api/useRun";
import { progressPercent } from "../lib/progress-percent";
import { OptimizeProgressPanel } from "./optimize-progress-panel";

export function ActionBar({
  label,
  busy,
  onRun,
  onCancel,
  progress,
  monteCarloRollouts,
}: {
  label: string;
  busy: boolean;
  onRun: () => void;
  onCancel: () => void;
  progress?: OptimizeProgress | null;
  monteCarloRollouts?: number;
}) {
  const percent = progressPercent(progress);

  return (
    <div className="action-bar">
      <div className="action-bar-controls">
        <button className="primary-action" onClick={onRun} disabled={busy}>
          {busy ? "Calculating…" : label}
          <span aria-hidden>→</span>
        </button>
        {busy && (
          <button className="text-action" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {busy && progress && (
        <OptimizeProgressPanel
          progress={progress}
          percent={percent}
          monteCarloRollouts={monteCarloRollouts}
        />
      )}
    </div>
  );
}
