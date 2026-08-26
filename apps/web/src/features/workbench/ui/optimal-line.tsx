"use client";

import type { ReactNode } from "react";
import type { LineStep } from "@/lib/engine";
import type { StepDiffInfo } from "../types";
import { CombatTape } from "./combat-tape";

export function OptimalLine({
  label = "OPTIMAL LINE",
  sampleId,
  steps,
  resetKey,
  stepDiff,
  diffPerspective,
  meta,
}: {
  label?: string;
  sampleId?: string | null;
  steps: LineStep[];
  resetKey: unknown;
  stepDiff?: StepDiffInfo[];
  diffPerspective?: "oracle" | "brick";
  meta?: ReactNode;
}) {
  return (
    <div className="combat-tape">
      <div className="tape-heading">
        <span>
          {label}
          {sampleId ? ` · ${sampleId}` : ""}
        </span>
        <span>
          {steps.length} steps
          {meta}
        </span>
      </div>
      <CombatTape
        steps={steps}
        resetKey={resetKey}
        stepDiff={stepDiff}
        diffPerspective={diffPerspective}
      />
    </div>
  );
}
