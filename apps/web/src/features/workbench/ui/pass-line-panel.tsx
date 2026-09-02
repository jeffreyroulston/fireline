"use client";

import type { CardId, LineEvent } from "@/lib/engine";
import type { StepDiffInfo } from "../types";
import { cn } from "@/lib/utils/cn";
import { LineHandStrips } from "./line-hand-strips";
import { OptimalLine } from "./optimal-line";

function formatSignedDelta(delta: number): string {
  if (delta > 0) {
    return `+${delta}`;
  }
  return String(delta);
}

export function PassLinePanel({
  label,
  damage,
  events,
  resetKey,
  stepDiff,
  note,
  oracle,
  damageDelta,
  openingHand,
}: {
  label: string;
  damage: number;
  events: LineEvent[];
  resetKey: string;
  stepDiff?: StepDiffInfo[];
  note?: string;
  oracle?: boolean;
  /** Signed gap vs the other line (your damage minus optimal). */
  damageDelta?: number | null;
  openingHand?: CardId[];
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
            "flex items-baseline gap-2 font-display text-[42px] leading-[0.9] text-primary",
            oracle && "text-secondary",
          )}
        >
          {damage}
          {damageDelta != null && damageDelta !== 0 ? (
            <span
              className={cn(
                "font-mono text-[18px] tracking-[0.04em]",
                damageDelta < 0 ? "text-destructive" : "text-secondary",
              )}
            >
              {formatSignedDelta(damageDelta)}
            </span>
          ) : null}
        </strong>
      </div>
      {openingHand && openingHand.length > 0 ? (
        <LineHandStrips openingHand={openingHand} events={events} />
      ) : null}
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
