"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { LineStep } from "@/lib/engine";
import { stepMatchesQuery } from "../lib/step-matches-query";
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
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
  }, [resetKey]);

  const trimmed = query.trim();
  const matchCount =
    trimmed.length === 0
      ? 0
      : steps.filter((step) => stepMatchesQuery(step, trimmed)).length;

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
      <label className="tape-search">
        <span className="visually-hidden">Search line steps</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search steps…"
          autoComplete="off"
          spellCheck={false}
        />
        {trimmed.length > 0 && (
          <span className="tape-search-count" aria-live="polite">
            {matchCount} match{matchCount === 1 ? "" : "es"}
          </span>
        )}
      </label>
      <CombatTape
        steps={steps}
        resetKey={resetKey}
        stepDiff={stepDiff}
        diffPerspective={diffPerspective}
        query={trimmed}
      />
    </div>
  );
}
