import { useQuery } from "@tanstack/react-query";
import { fetchCardDatabasePairings } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export function useCardDatabasePairingsQuery(
  cardId: string,
  filtersKey: string,
  fetcher: () => Promise<Awaited<ReturnType<typeof fetchCardDatabasePairings>>>,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.cardDatabasePairings(cardId, filtersKey),
    queryFn: fetcher,
    enabled,
  });
}
