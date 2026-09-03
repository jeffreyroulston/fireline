import { useQuery } from "@tanstack/react-query";
import { fetchVersionGroups, type RunSettingsFilter } from "@/lib/api/client";
import { queryKeys, versionGroupsScopeKey } from "@/lib/api/query-keys";

function runSettingsKey(filter?: RunSettingsFilter): string {
  if (!filter) return "all";
  const goFirst = (filter.goFirst ?? []).map((v) => (v ? "1" : "0")).join(",");
  const maxTurns = (filter.maxTurns ?? []).join(",");
  return `gf:${goFirst}|mt:${maxTurns}`;
}

export function useVersionGroupsQuery(
  options: {
    deckId?: string;
    deckHash?: string;
    simType?: string;
    kind?: "evaluate" | "optimize";
    runSettings?: RunSettingsFilter;
  },
  epoch = 0,
) {
  const scope = versionGroupsScopeKey(options);
  const simType = options.simType ?? "fire_brick";
  const kind = options.kind ?? "all";
  const settingsKey = runSettingsKey(options.runSettings);
  const enabled = Boolean(options.deckId || options.deckHash || scope === "global");

  return useQuery({
    queryKey: queryKeys.versionGroups(scope, simType, kind, epoch, settingsKey),
    queryFn: () =>
      fetchVersionGroups({
        deckId: options.deckId,
        deckHash: options.deckHash,
        simType: options.simType,
        kind: options.kind,
        runSettings: options.runSettings,
      }),
    enabled,
  });
}
