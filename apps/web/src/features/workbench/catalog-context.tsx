"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { hydrateCatalog } from "@/lib/api/catalog-hydrate";
import type { ApiCardRow, WorkerVersion } from "@/lib/api/shared";

type CatalogContextValue = {
  catalogEpoch: number;
  workerVersion: WorkerVersion | null;
};

const CatalogContext = createContext<CatalogContextValue>({
  catalogEpoch: 0,
  workerVersion: null,
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
  const [workerVersion, setWorkerVersion] = useState<WorkerVersion | null>(
    initialWorkerVersion,
  );

  useEffect(() => {
    hydrateCatalog(initialCatalog);
    setCatalogEpoch((epoch) => epoch + 1);
    setWorkerVersion(initialWorkerVersion);
  }, [initialCatalog, initialWorkerVersion]);

  return (
    <CatalogContext.Provider value={{ catalogEpoch, workerVersion }}>
      {children}
    </CatalogContext.Provider>
  );
}
