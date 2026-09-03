import { useQuery } from "@tanstack/react-query";
import { fetchPooledSampleHighlights, type RunSettingsFilter } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export type PooledSampleHighlightsQueryParams = {
  deckHash?: string;
  deckId?: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  runSettings?: RunSettingsFilter;
};

function runSettingsKey(filter?: RunSettingsFilter): string {
  if (!filter) return "all";
  const goFirst = (filter.goFirst ?? []).map((v) => (v ? "1" : "0")).join(",");
  const maxTurns = (filter.maxTurns ?? []).join(",");
  return `gf:${goFirst}|mt:${maxTurns}`;
}

function highlightsFiltersKey(
  params: PooledSampleHighlightsQueryParams,
): string {
  const deck = params.deckId ?? params.deckHash ?? "";
  return `${deck}:${params.simType}:${params.rulesVersion}:${params.samplerVersion}:${runSettingsKey(params.runSettings)}`;
}

export function usePooledSampleHighlightsQuery(
  params: PooledSampleHighlightsQueryParams | null,
  epoch = 0,
) {
  const filtersKey = params ? highlightsFiltersKey(params) : "";
  return useQuery({
    queryKey: queryKeys.pooledSampleHighlights(filtersKey, epoch),
    queryFn: () => fetchPooledSampleHighlights(params!),
    enabled: Boolean(params?.deckId || params?.deckHash),
  });
}
