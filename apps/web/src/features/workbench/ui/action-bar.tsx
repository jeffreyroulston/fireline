"use client";

import type { OptimizeProgress } from "@/lib/api/useRun";
import { buttonVariants } from "@/lib/utils/variants";
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
    <div className="mt-[22px] grid gap-3.5">
      <div className="flex flex-wrap items-center gap-[15px]">
        <button
          className={buttonVariants({ intent: "primary" })}
          onClick={onRun}
          disabled={busy}
        >
          {busy ? "Calculating…" : label}
          <span aria-hidden className="text-xl text-primary">
            →
          </span>
        </button>
        {busy && (
          <button
            className={buttonVariants({ intent: "text" })}
            onClick={onCancel}
          >
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
