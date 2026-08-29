import {
  fetchCardsServer,
  fetchDecksServer,
  fetchMaterialDecksServer,
  fetchWorkerVersionServer,
} from "@/lib/api/server";
import type { ApiCardRow, WorkerVersion } from "@/lib/api/shared";
import { mapApiDeckRows } from "@/lib/decks";
import { mapApiMaterialDeckRows } from "@/lib/material-decks";
import type { SavedDeck } from "@/lib/decks";
import type { SavedMaterialDeck } from "@/lib/material-decks";

export type WorkbenchBootstrapData = {
  decks: SavedDeck[];
  materialDecks: SavedMaterialDeck[];
  catalog: ApiCardRow[];
  workerVersion: WorkerVersion | null;
};

export async function loadWorkbenchBootstrapData(): Promise<WorkbenchBootstrapData> {
  const [deckRows, materialRows, catalog, workerVersion] = await Promise.all([
    fetchDecksServer().catch(() => []),
    fetchMaterialDecksServer().catch(() => []),
    fetchCardsServer().catch(() => []),
    fetchWorkerVersionServer().catch(() => null),
  ]);

  return {
    decks: mapApiDeckRows(deckRows as Parameters<typeof mapApiDeckRows>[0]),
    materialDecks: mapApiMaterialDeckRows(
      materialRows as Parameters<typeof mapApiMaterialDeckRows>[0],
    ),
    catalog: catalog as ApiCardRow[],
    workerVersion,
  };
}
