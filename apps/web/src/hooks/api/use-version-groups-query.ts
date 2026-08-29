import { useQuery } from "@tanstack/react-query";
import { fetchVersionGroups } from "@/lib/api/client";
import { queryKeys, versionGroupsScopeKey } from "@/lib/api/query-keys";

export function useVersionGroupsQuery(
  options: {
    deckId?: string;
    deckHash?: string;
    simType?: string;
    kind?: "evaluate" | "optimize";
  },
  epoch = 0,
) {
  const scope = versionGroupsScopeKey(options);
  const simType = options.simType ?? "fire_brick";
  const kind = options.kind ?? "evaluate";
  const enabled = Boolean(options.deckId || options.deckHash || scope === "global");

  return useQuery({
    queryKey: queryKeys.versionGroups(scope, simType, kind, epoch),
    queryFn: () =>
      fetchVersionGroups({
        deckId: options.deckId,
        deckHash: options.deckHash,
        simType: options.simType,
        kind: options.kind,
      }),
    enabled,
  });
}
