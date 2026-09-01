"use client";

import type { LineEvent } from "@/lib/engine";
import type { StepDiffInfo } from "../types";
import { cn } from "@/lib/utils/cn";
import { OptimalLine } from "./optimal-line";

export function PassLinePanel({
  label,
  damage,
  events,
  resetKey,
  stepDiff,
  note,
  oracle,
}: {
  label: string;
  damage: number;
  events: LineEvent[];
  resetKey: string;
  stepDiff?: StepDiffInfo[];
  note?: string;
  oracle?: boolean;
}) {
  const diffCount =
    stepDiff?.filter((entry) => entry.mark !== "same").length ?? 0;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
          {label.toUpperCase()}
        </span>
        <strong
          className={cn(
            "font-display text-[42px] leading-[0.9] text-primary",
            oracle && "text-secondary",
          )}
        >
          {damage}
        </strong>
      </div>
      {note && <p className="mb-3 text-[13px] text-muted">{note}</p>}
      <OptimalLine
        label={`${label.toUpperCase()} LINE`}
        events={events}
        resetKey={resetKey}
        stepDiff={stepDiff}
        diffPerspective={oracle ? "oracle" : stepDiff ? "brick" : undefined}
        meta={
          diffCount > 0 ? (
            <em
              className={cn(
                "ml-1 not-italic font-semibold",
                oracle ? "text-secondary-dark" : "text-primary",
              )}
            >
              {" "}
              · {diffCount} diffs
            </em>
          ) : undefined
        }
      />
    </div>
  );
}
