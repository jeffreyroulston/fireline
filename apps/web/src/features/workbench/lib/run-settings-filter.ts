import type { RunHistoryRow } from "@/lib/api/client";

export type RunSettingsFilter = {
  goFirst?: boolean[];
  maxTurns?: number[];
};

export type RunSettingsFilterState = {
  goFirst: Set<boolean>;
  maxTurns: Set<number>;
};

export type AvailableRunSettings = {
  goFirst: boolean[];
  maxTurns: number[];
};

export const GO_FIRST_OPTIONS: ReadonlyArray<{ value: boolean; label: string }> =
  [
    { value: true, label: "Going first" },
    { value: false, label: "Going second" },
  ];

export const MAX_TURN_OPTIONS = [2, 3, 4, 5] as const;

export function defaultRunSettingsState(): RunSettingsFilterState {
  return {
    goFirst: new Set(GO_FIRST_OPTIONS.map((entry) => entry.value)),
    maxTurns: new Set(MAX_TURN_OPTIONS),
  };
}

export function parseRunSettingsParams(
  searchParams: URLSearchParams,
): RunSettingsFilterState {
  const goFirstRaw = searchParams.getAll("go_first");
  const maxTurnsRaw = searchParams.getAll("max_turns");
  if (goFirstRaw.length === 0 && maxTurnsRaw.length === 0) {
    return defaultRunSettingsState();
  }

  const goFirst = new Set<boolean>();
  for (const value of goFirstRaw) {
    if (value === "1" || value === "true") {
      goFirst.add(true);
    } else if (value === "0" || value === "false") {
      goFirst.add(false);
    }
  }

  const maxTurns = new Set<number>();
  for (const value of maxTurnsRaw) {
    const turns = Number(value);
    if (Number.isInteger(turns) && turns >= 1 && turns <= 9) {
      maxTurns.add(turns);
    }
  }

  return { goFirst, maxTurns };
}

export function isDefaultRunSettingsState(
  state: RunSettingsFilterState,
): boolean {
  if (state.goFirst.size !== GO_FIRST_OPTIONS.length) {
    return false;
  }
  for (const entry of GO_FIRST_OPTIONS) {
    if (!state.goFirst.has(entry.value)) {
      return false;
    }
  }
  if (state.maxTurns.size !== MAX_TURN_OPTIONS.length) {
    return false;
  }
  for (const turns of MAX_TURN_OPTIONS) {
    if (!state.maxTurns.has(turns)) {
      return false;
    }
  }
  return true;
}

export function runSettingsToFilter(
  state: RunSettingsFilterState,
): RunSettingsFilter | undefined {
  if (isDefaultRunSettingsState(state)) {
    return undefined;
  }
  return {
    ...(state.goFirst.size > 0
      ? { goFirst: [...state.goFirst].sort((a, b) => Number(b) - Number(a)) }
      : {}),
    ...(state.maxTurns.size > 0
      ? { maxTurns: [...state.maxTurns].sort((a, b) => a - b) }
      : {}),
  };
}

export function runSettingsFilterKey(state: RunSettingsFilterState): string {
  if (isDefaultRunSettingsState(state)) {
    return "all";
  }
  const goFirst = [...state.goFirst]
    .map((value) => (value ? "1" : "0"))
    .sort()
    .join(",");
  const maxTurns = [...state.maxTurns].sort((a, b) => a - b).join(",");
  return `gf:${goFirst}|mt:${maxTurns}`;
}

export function appendRunSettingsFilter(
  search: URLSearchParams,
  filter?: RunSettingsFilter,
): void {
  if (!filter) {
    return;
  }
  for (const goFirst of filter.goFirst ?? []) {
    search.append("go_first", goFirst ? "1" : "0");
  }
  for (const maxTurns of filter.maxTurns ?? []) {
    search.append("max_turns", String(maxTurns));
  }
}

export function patchRunSettingsParams(
  params: URLSearchParams,
  state: RunSettingsFilterState,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  next.delete("go_first");
  next.delete("max_turns");
  const filter = runSettingsToFilter(state);
  appendRunSettingsFilter(next, filter);
  return next;
}

export function runMatchesSettingsFilter(
  run: Pick<RunHistoryRow, "goFirst" | "maxTurns">,
  state: RunSettingsFilterState,
): boolean {
  if (isDefaultRunSettingsState(state)) {
    return true;
  }
  if (run.goFirst != null && state.goFirst.size > 0 && !state.goFirst.has(run.goFirst)) {
    return false;
  }
  if (
    run.maxTurns != null &&
    state.maxTurns.size > 0 &&
    !state.maxTurns.has(run.maxTurns)
  ) {
    return false;
  }
  return true;
}

export function availableRunSettingsFromRuns(
  runs: Pick<RunHistoryRow, "goFirst" | "maxTurns">[],
): AvailableRunSettings {
  const goFirst = new Set<boolean>();
  const maxTurns = new Set<number>();
  for (const run of runs) {
    if (run.goFirst != null) {
      goFirst.add(run.goFirst);
    }
    if (run.maxTurns != null) {
      maxTurns.add(run.maxTurns);
    }
  }
  return {
    goFirst: [...goFirst].sort((a, b) => Number(b) - Number(a)),
    maxTurns: [...maxTurns].sort((a, b) => a - b),
  };
}

export function mergeAvailableRunSettings(
  fromApi: AvailableRunSettings | undefined,
  fromRuns: AvailableRunSettings,
): AvailableRunSettings {
  const goFirst = new Set([
    ...(fromApi?.goFirst ?? []),
    ...fromRuns.goFirst,
  ]);
  const maxTurns = new Set([
    ...(fromApi?.maxTurns ?? []),
    ...fromRuns.maxTurns,
  ]);
  return {
    goFirst: [...goFirst].sort((a, b) => Number(b) - Number(a)),
    maxTurns: [...maxTurns].sort((a, b) => a - b),
  };
}

export function activeRunSettingsSummary(
  state: RunSettingsFilterState,
): string | null {
  if (isDefaultRunSettingsState(state)) {
    return null;
  }
  const parts: string[] = [];
  if (state.goFirst.size < GO_FIRST_OPTIONS.length) {
    const labels = GO_FIRST_OPTIONS.filter((entry) =>
      state.goFirst.has(entry.value),
    ).map((entry) => entry.label);
    if (labels.length > 0) {
      parts.push(labels.join(", "));
    }
  }
  if (state.maxTurns.size < MAX_TURN_OPTIONS.length) {
    const turns = [...state.maxTurns].sort((a, b) => a - b);
    if (turns.length > 0) {
      parts.push(
        turns.length === 1
          ? `${turns[0]} turn${turns[0] === 1 ? "" : "s"}`
          : `${turns.join(", ")} turns`,
      );
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
