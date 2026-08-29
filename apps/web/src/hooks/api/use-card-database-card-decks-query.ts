import { useQuery } from "@tanstack/react-query";
import {
  fetchCardDatabaseCardDecks,
  type CardDatabaseSource,
} from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export function useCardDatabaseCardDecksQuery(
  source: CardDatabaseSource,
  cardId: string,
  filtersKey: string,
  fetcher: () => Promise<Awaited<ReturnType<typeof fetchCardDatabaseCardDecks>>>,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.cardDatabaseCardDecks(source, cardId, filtersKey),
    queryFn: fetcher,
    enabled,
  });
}
