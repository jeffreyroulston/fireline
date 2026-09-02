"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { LineEvent } from "@/lib/engine";
import { CARD_LIST } from "@/lib/engine";
import { buttonVariants } from "@/lib/utils/variants";
import { eventMatchesQuery } from "../lib/event-matches-query";
import { downloadLineTape } from "../lib/export-line-tape";
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
  highlightCardId = null,
}: {
  label?: string;
  sampleId?: string | null;
  events: LineEvent[];
  resetKey: unknown;
  stepDiff?: StepDiffInfo[];
  diffPerspective?: "oracle" | "brick";
  meta?: ReactNode;
  highlightCardId?: string | null;
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

  const handleExport = useCallback(() => {
    downloadLineTape(events, CARD_LIST, { label });
  }, [events, label]);

  return (
    <div className="mt-6 border border-border bg-surface px-[18px] pt-[18px] pb-3 shadow-[0_1px_0_color-mix(in_srgb,var(--color-foreground)_4%,transparent)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tracking-[0.08em] text-muted">
        <span>
          {label}
          {sampleId ? ` · ${sampleId}` : ""}
        </span>
        <span className="flex items-center gap-2.5">
          <span>
            {events.length} events
            {meta}
          </span>
          <button
            type="button"
            className={buttonVariants({ intent: "secondary", size: "compact" })}
            onClick={handleExport}
            disabled={events.length === 0}
          >
            Export
          </button>
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
        highlightCardId={highlightCardId}
      />
    </div>
  );
}
