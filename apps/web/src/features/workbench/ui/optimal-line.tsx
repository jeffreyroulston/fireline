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
    <div className="combat-tape">
      <div className="tape-heading">
        <span>
          {label}
          {sampleId ? ` · ${sampleId}` : ""}
        </span>
        <span>
          {events.length} events
          {meta}
        </span>
      </div>
      <label className="tape-search">
        <span className="visually-hidden">Search line events</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search events…"
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
        events={events}
        resetKey={resetKey}
        stepDiff={stepDiff}
        diffPerspective={diffPerspective}
        query={trimmed}
      />
    </div>
  );
}
