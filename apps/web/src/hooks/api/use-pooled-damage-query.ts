import { useQuery } from "@tanstack/react-query";
import { fetchPooledDamage } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export type PooledDamageQueryParams = {
  deckHash: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
};

function pooledDamageFiltersKey(params: PooledDamageQueryParams): string {
  return `${params.deckHash}:${params.simType}:${params.rulesVersion}:${params.samplerVersion}`;
}

export function usePooledDamageQuery(
  params: PooledDamageQueryParams | null,
  epoch = 0,
) {
  const filtersKey = params ? pooledDamageFiltersKey(params) : "";
  return useQuery({
    queryKey: queryKeys.pooledDamage(filtersKey, epoch),
    queryFn: () => fetchPooledDamage(params!),
    enabled: Boolean(params),
  });
}
