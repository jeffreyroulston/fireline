"use client";

import { cn, pillTabListClass, pillTabVariants } from "@/lib/utils";
import type { LineHorizon, Turn2KillResults } from "../types";

const turn2KillBannerClass = cn(
  "mb-4 border border-secondary/50 bg-[color-mix(in_srgb,var(--color-secondary)_12%,var(--color-surface-muted))]",
  "px-3 py-2.5 font-mono text-[11px] tracking-[0.06em] text-foreground uppercase",
);

const horizonTabsClass = cn(pillTabListClass, "mb-4");

export function Turn2KillHorizon({
  results,
  lineHorizon,
  onLineHorizonChange,
}: {
  results: Turn2KillResults;
  lineHorizon: LineHorizon;
  onLineHorizonChange: (horizon: LineHorizon) => void;
}) {
  return (
    <>
      <p className={turn2KillBannerClass} role="status">
        Turn 2 kill detected · {results.turn2.maxDamage} damage ≥{" "}
        {results.threshold}
      </p>
      <div
        className={horizonTabsClass}
        role="tablist"
        aria-label="Turn horizon line"
      >
        {([2, 3] as const).map((horizon) => (
          <button
            key={horizon}
            type="button"
            role="tab"
            aria-selected={lineHorizon === horizon}
            className={pillTabVariants({ active: lineHorizon === horizon })}
            onClick={() => onLineHorizonChange(horizon)}
          >
            {horizon} turns
          </button>
        ))}
      </div>
    </>
  );
}
