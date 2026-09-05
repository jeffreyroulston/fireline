"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeDecklist,
  analyzeMaterialDecklist,
  formatDecklist,
  listToCounts,
  materialDeckCounts,
  parseMaterialDecklist,
  type CardId,
  type MaterialId,
} from "@ga-fire/game";

import {
  createPlayDeck,
  createPlayMaterialDeck,
  DEFAULT_MATERIAL_DECK_TEXT,
  deletePlayDeck,
  deletePlayMaterialDeck,
  fetchPlayDecks,
  fetchPlayMaterialDecks,
  nextDeckName,
  nextMaterialDeckName,
  updatePlayDeck,
  updatePlayMaterialDeck,
  type PlayDeck,
  type PlayMaterialDeck,
} from "@/lib/api/play-decks";

const SAVE_DEBOUNCE_MS = 400;

export function useDeckBuilderState() {
  const [decks, setDecks] = useState<PlayDeck[]>([]);
  const [materialDecks, setMaterialDecks] = useState<PlayMaterialDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [activeDeckId, setActiveDeckId] = useState("");
  const [deckText, setDeckText] = useState("");
  const [activeMaterialDeckId, setActiveMaterialDeckId] = useState("");
  const [materialText, setMaterialText] = useState("");

  const [isRenamingDeck, setIsRenamingDeck] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenamingMaterial, setIsRenamingMaterial] = useState(false);
  const [materialRenameDraft, setMaterialRenameDraft] = useState("");

  const deckSaveTimer = useRef<number | null>(null);
  const materialSaveTimer = useRef<number | null>(null);
  const deckTextRef = useRef(deckText);
  const materialTextRef = useRef(materialText);
  deckTextRef.current = deckText;
  materialTextRef.current = materialText;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deckRows, materialRows] = await Promise.all([
        fetchPlayDecks(),
        fetchPlayMaterialDecks(),
      ]);
      setDecks(deckRows);
      setMaterialDecks(materialRows);
      setActiveDeckId((current) => {
        if (current && deckRows.some((deck) => deck.id === current)) {
          return current;
        }
        return deckRows[0]?.id ?? "";
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load decks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDeck = useMemo(
    () => decks.find((deck) => deck.id === activeDeckId) ?? null,
    [decks, activeDeckId],
  );

  const activeMaterialDeck = useMemo(() => {
    const linkedId = activeDeck?.materialDeckId || activeMaterialDeckId;
    return (
      materialDecks.find((deck) => deck.id === linkedId) ??
      materialDecks[0] ??
      null
    );
  }, [activeDeck, activeMaterialDeckId, materialDecks]);

  useEffect(() => {
    if (!activeDeck) {
      setDeckText("");
      return;
    }
    setDeckText(activeDeck.text);
    setActiveMaterialDeckId(activeDeck.materialDeckId);
  }, [activeDeck]);

  useEffect(() => {
    if (!activeMaterialDeck) {
      setMaterialText("");
      return;
    }
    setMaterialText(activeMaterialDeck.text);
  }, [activeMaterialDeck]);

  const clearDeckSaveTimer = useCallback(() => {
    if (deckSaveTimer.current != null) {
      window.clearTimeout(deckSaveTimer.current);
      deckSaveTimer.current = null;
    }
  }, []);

  const clearMaterialSaveTimer = useCallback(() => {
    if (materialSaveTimer.current != null) {
      window.clearTimeout(materialSaveTimer.current);
      materialSaveTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearDeckSaveTimer();
      clearMaterialSaveTimer();
    },
    [clearDeckSaveTimer, clearMaterialSaveTimer],
  );

  const persistDeck = useCallback(
    async (id: string, patch: { name?: string; text?: string; materialDeckId?: string }) => {
      setSaving(true);
      try {
        const saved = await updatePlayDeck(id, patch);
        setDecks((current) =>
          current.map((deck) => (deck.id === saved.id ? saved : deck)),
        );
        setError(null);
        return saved;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save deck.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const persistMaterial = useCallback(
    async (id: string, patch: { name?: string; text?: string }) => {
      setSaving(true);
      try {
        const saved = await updatePlayMaterialDeck(id, patch);
        setMaterialDecks((current) =>
          current.map((deck) => (deck.id === saved.id ? saved : deck)),
        );
        setError(null);
        return saved;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save material deck.",
        );
        return null;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const scheduleDeckSave = useCallback(
    (id: string, text: string) => {
      clearDeckSaveTimer();
      deckSaveTimer.current = window.setTimeout(() => {
        void persistDeck(id, { text });
      }, SAVE_DEBOUNCE_MS);
    },
    [clearDeckSaveTimer, persistDeck],
  );

  const scheduleMaterialSave = useCallback(
    (id: string, text: string) => {
      clearMaterialSaveTimer();
      materialSaveTimer.current = window.setTimeout(() => {
        void persistMaterial(id, { text });
      }, SAVE_DEBOUNCE_MS);
    },
    [clearMaterialSaveTimer, persistMaterial],
  );

  const updateDeckText = useCallback(
    (text: string) => {
      setDeckText(text);
      if (!activeDeck) return;
      setDecks((current) =>
        current.map((deck) =>
          deck.id === activeDeck.id ? { ...deck, text } : deck,
        ),
      );
      scheduleDeckSave(activeDeck.id, text);
    },
    [activeDeck, scheduleDeckSave],
  );

  const updateMaterialText = useCallback(
    (text: string) => {
      if (!activeMaterialDeck || activeMaterialDeck.isSystem) return;
      setMaterialText(text);
      setMaterialDecks((current) =>
        current.map((deck) =>
          deck.id === activeMaterialDeck.id ? { ...deck, text } : deck,
        ),
      );
      scheduleMaterialSave(activeMaterialDeck.id, text);
    },
    [activeMaterialDeck, scheduleMaterialSave],
  );

  const switchDeck = useCallback(
    (deckId: string) => {
      clearDeckSaveTimer();
      clearMaterialSaveTimer();
      setIsRenamingDeck(false);
      setIsRenamingMaterial(false);
      setActiveDeckId(deckId);
    },
    [clearDeckSaveTimer, clearMaterialSaveTimer],
  );

  const createDeck = useCallback(async () => {
    clearDeckSaveTimer();
    try {
      const created = await createPlayDeck({
        name: nextDeckName(decks),
        text: "",
        materialDeckId: activeMaterialDeck?.id,
      });
      setDecks((current) => [created, ...current]);
      setActiveDeckId(created.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deck.");
    }
  }, [activeMaterialDeck?.id, clearDeckSaveTimer, decks]);

  const deleteDeck = useCallback(async () => {
    if (!activeDeck) return;
    if (!window.confirm(`Delete “${activeDeck.name}”?`)) return;
    clearDeckSaveTimer();
    try {
      await deletePlayDeck(activeDeck.id);
      setDecks((current) => {
        const next = current.filter((deck) => deck.id !== activeDeck.id);
        setActiveDeckId(next[0]?.id ?? "");
        return next;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete deck.");
    }
  }, [activeDeck, clearDeckSaveTimer]);

  const startRenameDeck = useCallback(() => {
    if (!activeDeck) return;
    setRenameDraft(activeDeck.name);
    setIsRenamingDeck(true);
  }, [activeDeck]);

  const commitRenameDeck = useCallback(async () => {
    if (!activeDeck) return;
    const saved = await persistDeck(activeDeck.id, { name: renameDraft });
    if (saved) setIsRenamingDeck(false);
  }, [activeDeck, persistDeck, renameDraft]);

  const assignMaterialDeck = useCallback(
    async (materialDeckId: string) => {
      if (!activeDeck) return;
      setActiveMaterialDeckId(materialDeckId);
      await persistDeck(activeDeck.id, { materialDeckId });
    },
    [activeDeck, persistDeck],
  );

  const createMaterialDeck = useCallback(async () => {
    try {
      const created = await createPlayMaterialDeck({
        name: nextMaterialDeckName(materialDecks),
        text: DEFAULT_MATERIAL_DECK_TEXT,
      });
      setMaterialDecks((current) => [created, ...current]);
      if (activeDeck) {
        await persistDeck(activeDeck.id, { materialDeckId: created.id });
        setActiveMaterialDeckId(created.id);
      } else {
        setActiveMaterialDeckId(created.id);
      }
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create material deck.",
      );
    }
  }, [activeDeck, materialDecks, persistDeck]);

  const deleteMaterialDeck = useCallback(async () => {
    if (!activeMaterialDeck || activeMaterialDeck.isSystem) return;
    if (!window.confirm(`Delete material deck “${activeMaterialDeck.name}”?`)) {
      return;
    }
    clearMaterialSaveTimer();
    try {
      const remaining = materialDecks.filter(
        (deck) => deck.id !== activeMaterialDeck.id,
      );
      const fallback = remaining.find((deck) => deck.isSystem) ?? remaining[0];
      if (!fallback) {
        setError("Cannot delete the last material deck.");
        return;
      }

      // Reassign any play decks still pointing at this material list.
      const linked = decks.filter(
        (deck) => deck.materialDeckId === activeMaterialDeck.id,
      );
      await Promise.all(
        linked.map((deck) =>
          updatePlayDeck(deck.id, { materialDeckId: fallback.id }),
        ),
      );
      setDecks((current) =>
        current.map((deck) =>
          deck.materialDeckId === activeMaterialDeck.id
            ? { ...deck, materialDeckId: fallback.id }
            : deck,
        ),
      );

      await deletePlayMaterialDeck(activeMaterialDeck.id);
      setMaterialDecks(remaining);
      setActiveMaterialDeckId(fallback.id);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete material deck.",
      );
    }
  }, [
    activeMaterialDeck,
    clearMaterialSaveTimer,
    decks,
    materialDecks,
  ]);

  const startRenameMaterial = useCallback(() => {
    if (!activeMaterialDeck || activeMaterialDeck.isSystem) return;
    setMaterialRenameDraft(activeMaterialDeck.name);
    setIsRenamingMaterial(true);
  }, [activeMaterialDeck]);

  const commitRenameMaterial = useCallback(async () => {
    if (!activeMaterialDeck) return;
    const saved = await persistMaterial(activeMaterialDeck.id, {
      name: materialRenameDraft,
    });
    if (saved) setIsRenamingMaterial(false);
  }, [activeMaterialDeck, materialRenameDraft, persistMaterial]);

  const deckAnalysis = useMemo(() => analyzeDecklist(deckText), [deckText]);
  const materialAnalysis = useMemo(
    () => analyzeMaterialDecklist(materialText),
    [materialText],
  );

  const deckCards = deckAnalysis.cards;
  const materialCards = useMemo(
    () =>
      Object.keys(
        materialDeckCounts(parseMaterialDecklist(materialText)),
      ) as MaterialId[],
    [materialText],
  );

  const deckCounts = useMemo(() => listToCounts(deckCards), [deckCards]);
  const materialCounts = useMemo(
    () => materialDeckCounts(parseMaterialDecklist(materialText)),
    [materialText],
  );

  return {
    decks,
    materialDecks,
    loading,
    error,
    saving,
    activeDeck,
    activeMaterialDeck,
    deckText,
    materialText,
    deckCards,
    materialCards,
    deckCounts,
    materialCounts,
    recognizedDeckCount: deckAnalysis.recognizedCount,
    unrecognizedLines: deckAnalysis.unrecognizedLines,
    materialIssues: materialAnalysis.issues,
    isRenamingDeck,
    renameDraft,
    setRenameDraft,
    isRenamingMaterial,
    materialRenameDraft,
    setMaterialRenameDraft,
    switchDeck,
    createDeck,
    deleteDeck,
    startRenameDeck,
    commitRenameDeck,
    cancelRenameDeck: () => setIsRenamingDeck(false),
    updateDeckText,
    assignMaterialDeck,
    createMaterialDeck,
    deleteMaterialDeck,
    startRenameMaterial,
    commitRenameMaterial,
    cancelRenameMaterial: () => setIsRenamingMaterial(false),
    updateMaterialText,
    flushSaves: async () => {
      clearDeckSaveTimer();
      clearMaterialSaveTimer();
      const tasks: Promise<unknown>[] = [];
      if (activeDeck && deckTextRef.current !== activeDeck.text) {
        tasks.push(persistDeck(activeDeck.id, { text: deckTextRef.current }));
      }
      if (
        activeMaterialDeck &&
        !activeMaterialDeck.isSystem &&
        materialTextRef.current !== activeMaterialDeck.text
      ) {
        tasks.push(
          persistMaterial(activeMaterialDeck.id, {
            text: materialTextRef.current,
          }),
        );
      }
      await Promise.all(tasks);
    },
  };
}

export type DeckBuilderState = ReturnType<typeof useDeckBuilderState>;

export function commitCountsToText(
  counts: Record<string, number>,
  unrecognizedLines: string[],
): string {
  const formatted = formatDecklist(counts);
  if (unrecognizedLines.length === 0) return formatted;
  const trailer = unrecognizedLines.join("\n");
  return formatted ? `${formatted.trimEnd()}\n\n${trailer}\n` : `${trailer}\n`;
}

export function addCardToCounts(
  counts: Record<string, number>,
  id: CardId,
  max: number,
): Record<string, number> | null {
  const qty = counts[id] ?? 0;
  if (qty >= max) return null;
  return { ...counts, [id]: qty + 1 };
}

export function removeCardFromCounts(
  counts: Record<string, number>,
  id: string,
): Record<string, number> {
  const next = { ...counts };
  const qty = next[id] ?? 0;
  if (qty <= 1) {
    delete next[id];
  } else {
    next[id] = qty - 1;
  }
  return next;
}
