import { useQuery } from "@tanstack/react-query";
import { fetchCardLeaderboard, type RunSettingsFilter } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export type CardLeaderboardQueryParams = {
  deckHash: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  attributionVersion: number;
  damageGte?: number;
  damageLte?: number;
  runSettings?: RunSettingsFilter;
};

function runSettingsKey(filter?: RunSettingsFilter): string {
  if (!filter) return "all";
  const goFirst = (filter.goFirst ?? []).map((v) => (v ? "1" : "0")).join(",");
  const maxTurns = (filter.maxTurns ?? []).join(",");
  return `gf:${goFirst}|mt:${maxTurns}`;
}

function cardLeaderboardFiltersKey(params: CardLeaderboardQueryParams): string {
  const range =
    params.damageGte != null || params.damageLte != null
      ? `:${params.damageGte ?? ""}:${params.damageLte ?? ""}`
      : "";
  return `${params.deckHash}:${params.simType}:${params.rulesVersion}:${params.samplerVersion}:${params.attributionVersion}${range}:${runSettingsKey(params.runSettings)}`;
}

export function useCardLeaderboardQuery(
  params: CardLeaderboardQueryParams | null,
  epoch = 0,
) {
  const filtersKey = params ? cardLeaderboardFiltersKey(params) : "";
  return useQuery({
    queryKey: queryKeys.cardLeaderboard(filtersKey, epoch),
    queryFn: () => fetchCardLeaderboard(params!),
    enabled: Boolean(params),
  });
}
