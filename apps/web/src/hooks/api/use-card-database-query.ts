import { useQuery } from "@tanstack/react-query";
import {
  fetchCardDatabase,
  type CardDatabaseSource,
} from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export function useCardDatabaseQuery(
  source: CardDatabaseSource,
  filtersKey: string,
  fetcher: () => Promise<Awaited<ReturnType<typeof fetchCardDatabase>>>,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.cardDatabase(source, filtersKey),
    queryFn: fetcher,
    enabled,
  });
}
