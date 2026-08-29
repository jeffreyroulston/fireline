"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/api/query-provider";
import { RunTrackerProvider } from "@/lib/runs/run-tracker";
import type { ApiCardRow, WorkerVersion } from "@/lib/api/shared";
import type { SavedDeck } from "@/lib/decks";
import type { SavedMaterialDeck } from "@/lib/material-decks";
import { CatalogHydrator } from "./catalog-context";
import { WorkbenchDeckProvider } from "./workbench-deck-context";

export function WorkbenchProviders({
  initialDecks,
  initialMaterialDecks,
  initialCatalog,
  initialWorkerVersion,
  children,
}: {
  initialDecks: SavedDeck[];
  initialMaterialDecks: SavedMaterialDeck[];
  initialCatalog: ApiCardRow[];
  initialWorkerVersion: WorkerVersion | null;
  children: ReactNode;
}) {
  return (
    <RunTrackerProvider>
      <QueryProvider>
        <WorkbenchDeckProvider
          initialDecks={initialDecks}
          initialMaterialDecks={initialMaterialDecks}
        >
          <CatalogHydrator
            initialCatalog={initialCatalog}
            initialWorkerVersion={initialWorkerVersion}
          >
            {children}
          </CatalogHydrator>
        </WorkbenchDeckProvider>
      </QueryProvider>
    </RunTrackerProvider>
  );
}
