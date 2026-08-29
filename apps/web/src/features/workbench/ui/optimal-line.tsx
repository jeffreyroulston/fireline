"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { LineEvent } from "@/lib/engine";
import { CARD_LIST } from "@/lib/engine";
import { eventMatchesQuery } from "../lib/event-matches-query";
import { expandEventZones } from "../lib/expand-zones";
import type { StepDiffInfo } from "../types";
import { CombatTape } from "./combat-tape";

export function OptimalLine({
  label = "OPTIMAL LINE",
  sampleId,
  events,
  resetKey,
  stepDiff,
  diffPerspective,
  meta,
}: {
  label?: string;
  sampleId?: string | null;
  events: LineEvent[];
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
  const tape = expandEventZones(events);
  const matchCount =
    trimmed.length === 0
      ? 0
      : tape.filter((event) =>
          eventMatchesQuery(event, trimmed, CARD_LIST),
        ).length;

  return (
    <div className="mt-6 border border-border bg-surface px-[18px] pt-[18px] pb-3 shadow-[0_1px_0_color-mix(in_srgb,var(--color-foreground)_4%,transparent)]">
      <div className="mb-3 flex justify-between font-mono text-[11px] tracking-[0.08em] text-muted">
        <span>
          {label}
          {sampleId ? ` · ${sampleId}` : ""}
        </span>
        <span>
          {events.length} events
          {meta}
        </span>
      </div>
      <label className="mb-3 flex items-center gap-2.5">
        <span className="sr-only">Search line events</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search events…"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 border border-border bg-surface-muted px-2.5 py-2 text-foreground"
        />
        {trimmed.length > 0 && (
          <span
            className="shrink-0 font-mono text-[10px] tracking-[0.04em] text-muted uppercase"
            aria-live="polite"
          >
            {matchCount} match{matchCount === 1 ? "" : "es"}
          </span>
        )}
      </label>
      <CombatTape
        events={events}
        resetKey={resetKey}
        stepDiff={stepDiff}
        diffPerspective={diffPerspective}
        query={trimmed}
      />
    </div>
  );
}
