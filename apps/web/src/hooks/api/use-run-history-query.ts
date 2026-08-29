import { useQuery } from "@tanstack/react-query";
import { fetchRunHistory } from "@/lib/api/client";
import { historyScopeKey, queryKeys } from "@/lib/api/query-keys";

export function useRunHistoryQuery(
  options?: { deckId?: string; deckHash?: string },
  epoch = 0,
) {
  const scope = historyScopeKey(options);
  return useQuery({
    queryKey: queryKeys.runHistory(scope, epoch),
    queryFn: () => fetchRunHistory(options),
  });
}
