"use client";

import type { LineStep } from "@/lib/engine";
import type { StepDiffInfo } from "../types";
import { OptimalLine } from "./optimal-line";

export function PassLinePanel({
  label,
  damage,
  steps,
  resetKey,
  stepDiff,
  note,
  oracle,
}: {
  label: string;
  damage: number;
  steps: LineStep[];
  resetKey: string;
  stepDiff?: StepDiffInfo[];
  note?: string;
  oracle?: boolean;
}) {
  const diffCount =
    stepDiff?.filter((entry) => entry.mark !== "same").length ?? 0;

  return (
    <div className={`pass-panel ${oracle ? "is-oracle" : ""}`}>
      <div className="pass-heading">
        <span>{label.toUpperCase()}</span>
        <strong>{damage}</strong>
      </div>
      {note && <p className="pass-note">{note}</p>}
      <OptimalLine
        label={`${label.toUpperCase()} LINE`}
        steps={steps}
        resetKey={resetKey}
        stepDiff={oracle ? stepDiff : undefined}
        diffPerspective={oracle ? "oracle" : undefined}
        meta={
          diffCount > 0 && oracle ? (
            <em className="tape-diff-count"> · {diffCount} diffs</em>
          ) : undefined
        }
      />
    </div>
  );
}
