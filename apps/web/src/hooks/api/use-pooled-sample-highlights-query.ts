import { useQuery } from "@tanstack/react-query";
import { fetchPooledSampleHighlights } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export type PooledSampleHighlightsQueryParams = {
  deckHash: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
};

function highlightsFiltersKey(
  params: PooledSampleHighlightsQueryParams,
): string {
  return `${params.deckHash}:${params.simType}:${params.rulesVersion}:${params.samplerVersion}`;
}

export function usePooledSampleHighlightsQuery(
  params: PooledSampleHighlightsQueryParams | null,
  epoch = 0,
) {
  const filtersKey = params ? highlightsFiltersKey(params) : "";
  return useQuery({
    queryKey: queryKeys.pooledSampleHighlights(filtersKey, epoch),
    queryFn: () => fetchPooledSampleHighlights(params!),
    enabled: Boolean(params),
  });
}
