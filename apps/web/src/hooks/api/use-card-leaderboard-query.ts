import { useQuery } from "@tanstack/react-query";
import { fetchCardLeaderboard } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export type CardLeaderboardQueryParams = {
  deckHash: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  attributionVersion: number;
  damageGte?: number;
  damageLte?: number;
};

function cardLeaderboardFiltersKey(params: CardLeaderboardQueryParams): string {
  const range =
    params.damageGte != null || params.damageLte != null
      ? `:${params.damageGte ?? ""}:${params.damageLte ?? ""}`
      : "";
  return `${params.deckHash}:${params.simType}:${params.rulesVersion}:${params.samplerVersion}:${params.attributionVersion}${range}`;
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
