"use client";

import { cn } from "@/lib/utils";
import {
  GO_FIRST_OPTIONS,
  type AvailableRunSettings,
  type RunSettingsFilterState,
  activeRunSettingsSummary,
  defaultRunSettingsState,
} from "../lib/run-settings-filter";
import { cardDbKindButtonClass } from "../panels/card-database/shared";

export type RunSettingsFilterBarProps = Readonly<{
  value: RunSettingsFilterState;
  available?: AvailableRunSettings;
  className?: string;
  onChange: (next: RunSettingsFilterState) => void;
}>;

function toggleGoFirst(
  state: RunSettingsFilterState,
  value: boolean,
): RunSettingsFilterState {
  const goFirst = new Set(state.goFirst);
  if (goFirst.has(value)) {
    if (goFirst.size <= 1) {
      return state;
    }
    goFirst.delete(value);
  } else {
    goFirst.add(value);
  }
  return { ...state, goFirst };
}

function toggleMaxTurns(
  state: RunSettingsFilterState,
  turns: number,
): RunSettingsFilterState {
  const maxTurns = new Set(state.maxTurns);
  if (maxTurns.has(turns)) {
    if (maxTurns.size <= 1) {
      return state;
    }
    maxTurns.delete(turns);
  } else {
    maxTurns.add(turns);
  }
  return { ...state, maxTurns };
}

export function RunSettingsFilterBar({
  value,
  available,
  className,
  onChange,
}: RunSettingsFilterBarProps) {
  const summary = activeRunSettingsSummary(value);
  const turnOptions =
    available && available.maxTurns.length > 0
      ? available.maxTurns
      : [2, 3, 4, 5];
  const goFirstOptions =
    available && available.goFirst.length > 0
      ? GO_FIRST_OPTIONS.filter((entry) =>
          available.goFirst.includes(entry.value),
        )
      : GO_FIRST_OPTIONS;

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.05em] text-muted uppercase">
          Turn order
        </span>
        {goFirstOptions.map((entry) => (
          <button
            key={entry.label}
            type="button"
            className={cardDbKindButtonClass(value.goFirst.has(entry.value))}
            onClick={() => onChange(toggleGoFirst(value, entry.value))}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.05em] text-muted uppercase">
          Turn horizon
        </span>
        {turnOptions.map((turns) => (
          <button
            key={turns}
            type="button"
            className={cardDbKindButtonClass(value.maxTurns.has(turns))}
            onClick={() => onChange(toggleMaxTurns(value, turns))}
          >
            {turns} turn{turns === 1 ? "" : "s"}
          </button>
        ))}
        <button
          type="button"
          className={cardDbKindButtonClass(false)}
          disabled={activeRunSettingsSummary(value) == null}
          onClick={() => onChange(defaultRunSettingsState())}
        >
          Reset
        </button>
      </div>
      {summary && (
        <p className="m-0 text-[0.92em] text-muted">Filtered to {summary}.</p>
      )}
    </div>
  );
}
