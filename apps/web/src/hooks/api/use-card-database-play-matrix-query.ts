import { useQuery } from "@tanstack/react-query";
import { fetchCardDatabasePlayMatrix } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export function useCardDatabasePlayMatrixQuery(
  cardId: string,
  filtersKey: string,
  fetcher: () => Promise<Awaited<ReturnType<typeof fetchCardDatabasePlayMatrix>>>,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.cardDatabasePlayMatrix(cardId, filtersKey),
    queryFn: fetcher,
    enabled,
  });
}
