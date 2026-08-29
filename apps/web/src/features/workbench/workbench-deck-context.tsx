"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseWorkbenchPath } from "./routes";
import { queryKeys } from "@/lib/api/query-keys";
import {
  createDeckRemote,
  deleteDeckRemote,
  isDeckCardlistLocked,
  loadActiveDeckId,
  loadDecksFromApi,
  nextDeckName,
  normalizeDeckName,
  refreshDecksRemote,
  saveActiveDeckId,
  scheduleDeckSave,
  type SavedDeck,
} from "@/lib/decks";
import {
  createMaterialDeckRemote,
  deleteMaterialDeckRemote,
  formatMaterialDeckDeleteError,
  loadMaterialDecksFromApi,
  normalizeMaterialDeckName,
  renameMaterialDeckRemote,
  type SavedMaterialDeck,
} from "@/lib/material-decks";

type WorkbenchDeckContextValue = {
  decks: SavedDeck[];
  materialDecks: SavedMaterialDeck[];
  decksHydrated: boolean;
  activeDeckId: string;
  activeDeck: SavedDeck | null;
  activeMaterialDeck: SavedMaterialDeck | null;
  deckText: string;
  setDecks: (updater: (current: SavedDeck[]) => SavedDeck[]) => void;
  setMaterialDecks: (updater: (current: SavedMaterialDeck[]) => SavedMaterialDeck[]) => void;
  updateActiveDeckText: (text: string) => void;
  updateActiveDeckMaterialDeck: (materialDeckId: string) => void;
  syncDeckRunCounts: () => Promise<void>;
  createNewDeck: () => Promise<SavedDeck | null>;
  duplicateActiveDeck: () => Promise<SavedDeck | null>;
  commitDeckRename: (name: string) => void;
  deleteActiveDeck: () => Promise<SavedDeck | null>;
  saveRatioDecklist: (
    text: string,
    preferredName: string,
  ) => Promise<SavedDeck | null>;
  createNewMaterialDeck: (
    name: string,
    text: string,
  ) => Promise<SavedMaterialDeck | null>;
  commitMaterialDeckRename: (name: string) => Promise<void>;
  deleteActiveMaterialDeck: (deck: SavedMaterialDeck) => Promise<void>;
  invalidateDecks: () => void;
  invalidateMaterialDecks: () => void;
};

const WorkbenchDeckContext = createContext<WorkbenchDeckContextValue | null>(
  null,
);

export function useWorkbenchDeck(): WorkbenchDeckContextValue {
  const context = useContext(WorkbenchDeckContext);
  if (!context) {
    throw new Error("useWorkbenchDeck must be used within WorkbenchDeckProvider");
  }
  return context;
}

export function WorkbenchDeckProvider({
  initialDecks,
  initialMaterialDecks,
  children,
}: {
  initialDecks: SavedDeck[];
  initialMaterialDecks: SavedMaterialDeck[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { deckId: routeDeckId } = parseWorkbenchPath(pathname);
  const queryClient = useQueryClient();

  const decksQuery = useQuery({
    queryKey: queryKeys.decks,
    queryFn: async () => (await loadDecksFromApi()).decks,
    initialData: initialDecks,
    staleTime: 30_000,
  });

  const materialDecksQuery = useQuery({
    queryKey: queryKeys.materialDecks,
    queryFn: loadMaterialDecksFromApi,
    initialData: initialMaterialDecks,
    staleTime: 30_000,
  });

  const decks = decksQuery.data ?? [];
  const materialDecks = materialDecksQuery.data ?? [];
  const decksHydrated = decksQuery.isSuccess;

  const setDecks = useCallback(
    (updater: (current: SavedDeck[]) => SavedDeck[]) => {
      queryClient.setQueryData<SavedDeck[]>(queryKeys.decks, (current) =>
        updater(current ?? []),
      );
    },
    [queryClient],
  );

  const setMaterialDecks = useCallback(
    (updater: (current: SavedMaterialDeck[]) => SavedMaterialDeck[]) => {
      queryClient.setQueryData<SavedMaterialDeck[]>(
        queryKeys.materialDecks,
        (current) => updater(current ?? []),
      );
    },
    [queryClient],
  );

  const activeDeckId = useMemo(() => {
    if (!decksHydrated || decks.length === 0) {
      return routeDeckId ?? "";
    }
    const valid = new Set(decks.map((deck) => deck.id));
    if (routeDeckId && valid.has(routeDeckId)) {
      return routeDeckId;
    }
    return loadActiveDeckId(decks);
  }, [decksHydrated, decks, routeDeckId]);

  const activeDeck =
    decks.find((deck) => deck.id === activeDeckId) ?? decks[0] ?? null;
  const deckText = activeDeck?.text ?? "";
  const activeMaterialDeck =
    materialDecks.find((deck) => deck.id === activeDeck?.materialDeckId) ??
    materialDecks.find((deck) => deck.isSystem) ??
    null;

  useEffect(() => {
    if (!decksHydrated || !activeDeckId) {
      return;
    }
    saveActiveDeckId(activeDeckId);
  }, [activeDeckId, decksHydrated]);

  useEffect(() => {
    if (!decksHydrated || !activeDeck) {
      return;
    }
    return scheduleDeckSave(activeDeck, (saved) => {
      setDecks((current) => {
        const existing = current.find((deck) => deck.id === saved.id);
        if (
          !existing ||
          (existing.deckHash === saved.deckHash &&
            existing.runCount === saved.runCount)
        ) {
          return current;
        }
        return current.map((deck) =>
          deck.id === saved.id
            ? {
                ...deck,
                deckHash: saved.deckHash,
                runCount: saved.runCount,
              }
            : deck,
        );
      });
    });
  }, [activeDeck, decksHydrated, setDecks]);

  const invalidateDecks = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.decks });
  }, [queryClient]);

  const invalidateMaterialDecks = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.materialDecks });
  }, [queryClient]);

  const updateActiveDeckText = useCallback(
    (text: string) => {
      if (!activeDeck || isDeckCardlistLocked(activeDeck)) {
        return;
      }
      setDecks((current) =>
        current.map((deck) =>
          deck.id === activeDeck.id ? { ...deck, text } : deck,
        ),
      );
    },
    [activeDeck, setDecks],
  );

  const updateActiveDeckMaterialDeck = useCallback(
    (materialDeckId: string) => {
      if (!activeDeck || isDeckCardlistLocked(activeDeck)) {
        return;
      }
      setDecks((current) =>
        current.map((deck) =>
          deck.id === activeDeck.id ? { ...deck, materialDeckId } : deck,
        ),
      );
    },
    [activeDeck, setDecks],
  );

  const syncDeckRunCounts = useCallback(async () => {
    try {
      const remote = await refreshDecksRemote();
      setDecks((current) =>
        current.map((deck) => {
          const match = remote.find((row) => row.id === deck.id);
          return match
            ? {
                ...deck,
                runCount: match.runCount,
                deckHash: match.deckHash,
                materialDeckId: match.materialDeckId,
              }
            : deck;
        }),
      );
    } catch {
      // Keep local state if refresh fails.
    }
  }, [setDecks]);

  const createNewDeck = useCallback(async () => {
    try {
      const deck = await createDeckRemote(nextDeckName(decks), "");
      setDecks((current) => [...current, deck]);
      invalidateDecks();
      return deck;
    } catch {
      return null;
    }
  }, [decks, invalidateDecks, setDecks]);

  const duplicateActiveDeck = useCallback(async () => {
    if (!activeDeck) {
      return null;
    }
    try {
      const deck = await createDeckRemote(
        nextDeckName(decks, `${activeDeck.name} copy`),
        activeDeck.text,
        activeDeck.materialDeckId,
      );
      setDecks((current) => [...current, deck]);
      invalidateDecks();
      return deck;
    } catch {
      return null;
    }
  }, [activeDeck, decks, invalidateDecks, setDecks]);

  const commitDeckRename = useCallback(
    (name: string) => {
      if (!activeDeck) {
        return;
      }
      const normalized = normalizeDeckName(name);
      setDecks((current) =>
        current.map((deck) =>
          deck.id === activeDeck.id ? { ...deck, name: normalized } : deck,
        ),
      );
    },
    [activeDeck, setDecks],
  );

  const deleteActiveDeck = useCallback(async () => {
    if (!activeDeck) {
      return null;
    }
    try {
      await deleteDeckRemote(activeDeck.id);
      if (decks.length === 1) {
        const deck = await createDeckRemote(nextDeckName([]), "");
        setDecks(() => [deck]);
        invalidateDecks();
        return deck;
      }
      const remaining = decks.filter((deck) => deck.id !== activeDeck.id);
      setDecks(() => remaining);
      invalidateDecks();
      return remaining[0] ?? null;
    } catch {
      return null;
    }
  }, [activeDeck, decks, invalidateDecks, setDecks]);

  const saveRatioDecklist = useCallback(
    async (text: string, preferredName: string) => {
      try {
        const deck = await createDeckRemote(nextDeckName(decks, preferredName), text);
        setDecks((current) => [...current, deck]);
        invalidateDecks();
        return deck;
      } catch {
        return null;
      }
    },
    [decks, invalidateDecks, setDecks],
  );

  const createNewMaterialDeck = useCallback(
    async (name: string, text: string) => {
      try {
        const deck = await createMaterialDeckRemote(name, text);
        setMaterialDecks((current) => [deck, ...current]);
        updateActiveDeckMaterialDeck(deck.id);
        invalidateMaterialDecks();
        return deck;
      } catch {
        return null;
      }
    },
    [
      invalidateMaterialDecks,
      setMaterialDecks,
      updateActiveDeckMaterialDeck,
    ],
  );

  const commitMaterialDeckRename = useCallback(
    async (name: string) => {
      if (!activeMaterialDeck) {
        return;
      }
      const normalized = normalizeMaterialDeckName(name);
      const saved = await renameMaterialDeckRemote(
        activeMaterialDeck.id,
        normalized,
      );
      setMaterialDecks((current) =>
        current.map((deck) => (deck.id === saved.id ? saved : deck)),
      );
      invalidateMaterialDecks();
    },
    [activeMaterialDeck, invalidateMaterialDecks, setMaterialDecks],
  );

  const deleteActiveMaterialDeck = useCallback(
    async (deck: SavedMaterialDeck) => {
      try {
        await deleteMaterialDeckRemote(deck.id);
        const remaining = materialDecks.filter((row) => row.id !== deck.id);
        setMaterialDecks(() => remaining);
        if (activeDeck?.materialDeckId === deck.id) {
          const fallback =
            remaining.find((row) => row.isSystem) ?? remaining[0] ?? null;
          if (fallback) {
            updateActiveDeckMaterialDeck(fallback.id);
          }
        }
        invalidateMaterialDecks();
      } catch (error) {
        throw new Error(formatMaterialDeckDeleteError(error));
      }
    },
    [
      activeDeck?.materialDeckId,
      invalidateMaterialDecks,
      materialDecks,
      setMaterialDecks,
      updateActiveDeckMaterialDeck,
    ],
  );

  const value: WorkbenchDeckContextValue = {
    decks,
    materialDecks,
    decksHydrated,
    activeDeckId,
    activeDeck,
    activeMaterialDeck,
    deckText,
    setDecks,
    setMaterialDecks,
    updateActiveDeckText,
    updateActiveDeckMaterialDeck,
    syncDeckRunCounts,
    createNewDeck,
    duplicateActiveDeck,
    commitDeckRename,
    deleteActiveDeck,
    saveRatioDecklist,
    createNewMaterialDeck,
    commitMaterialDeckRename,
    deleteActiveMaterialDeck,
    invalidateDecks,
    invalidateMaterialDecks,
  };

  return (
    <WorkbenchDeckContext.Provider value={value}>
      {children}
    </WorkbenchDeckContext.Provider>
  );
}
