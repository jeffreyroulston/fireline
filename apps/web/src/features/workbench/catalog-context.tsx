"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BUNDLED_CARD_DIGEST, catalogDigestMismatch } from "@ga-fire/game";
import { fetchCards, fetchWorkerVersion } from "@/lib/api/client";
import { hydrateCatalog } from "@/lib/api/catalog-hydrate";
import { queryKeys } from "@/lib/api/query-keys";
import type { ApiCardRow, WorkerVersion } from "@/lib/api/shared";
import { useRunTracker } from "@/lib/runs/run-tracker";

type CatalogContextValue = {
  catalogEpoch: number;
  workerVersion: WorkerVersion | null;
  catalogDigestMatched: boolean | null;
};

const CatalogContext = createContext<CatalogContextValue>({
  catalogEpoch: 0,
  workerVersion: null,
  catalogDigestMatched: null,
});

export function useCatalogContext(): CatalogContextValue {
  return useContext(CatalogContext);
}

export function CatalogHydrator({
  initialCatalog,
  initialWorkerVersion,
  children,
}: {
  initialCatalog: ApiCardRow[];
  initialWorkerVersion: WorkerVersion | null;
  children: ReactNode;
}) {
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [catalogDigestMatched, setCatalogDigestMatched] = useState<
    boolean | null
  >(null);
  const { workerReachable } = useRunTracker();
  const queryClient = useQueryClient();
  const wasReachable = useRef(workerReachable);

  // Same pattern as decks: an empty SSR bootstrap usually means the server
  // fetch failed (swallowed to null). Don't treat that as a final value.
  const versionQuery = useQuery({
    queryKey: queryKeys.workerVersion,
    queryFn: fetchWorkerVersion,
    ...(initialWorkerVersion ? { initialData: initialWorkerVersion } : {}),
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data ? false : 3_000),
  });
  const workerVersion = versionQuery.data ?? null;

  useEffect(() => {
    hydrateCatalog(initialCatalog);
    setCatalogEpoch((epoch) => epoch + 1);
  }, [initialCatalog]);

  useEffect(() => {
    const digest = workerVersion?.cardDigest;
    if (digest == null) {
      setCatalogDigestMatched(null);
      return;
    }
    const matched = !catalogDigestMismatch(digest);
    setCatalogDigestMatched(matched);
    if (matched) {
      return;
    }
    // Bundle stale vs live engine — refresh display catalog from API /cards.
    void fetchCards()
      .then((cards) => {
        if (cards.length > 0) {
          hydrateCatalog(cards);
          setCatalogEpoch((epoch) => epoch + 1);
        }
      })
      .catch(() => {
        // Keep SSR/bundled hydrate if cards fetch fails.
      });
  }, [workerVersion?.cardDigest]);

  useEffect(() => {
    if (workerReachable && !wasReachable.current) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workerVersion });
    }
    wasReachable.current = workerReachable;
  }, [queryClient, workerReachable]);

  return (
    <CatalogContext.Provider
      value={{
        catalogEpoch,
        workerVersion,
        catalogDigestMatched:
          catalogDigestMatched ??
          (workerVersion?.cardDigest != null
            ? workerVersion.cardDigest === BUNDLED_CARD_DIGEST
            : null),
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}
