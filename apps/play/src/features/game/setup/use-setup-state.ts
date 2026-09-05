"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  analyzeDecklist,
  cardsFromCounts,
  listToCounts,
  makeSeed,
  materialDeckCounts,
  OPENING_HAND_SIZE,
  parseMaterialDecklist,
  shuffleDeck,
  type CardId,
  type DeckCounts,
} from "@ga-fire/game";
import {
  DEFAULT_MATERIAL_DECK_TEXT,
  fetchSavedDecks,
  fetchSavedMaterialDecks,
  type SavedDeckRow,
  type SavedMaterialDeckRow,
} from "./api";
import { buildPlaytestInitRequest } from "./build-init-request";

export type DeckSource = "saved" | "paste";

export function useSetupState(options?: {
  preferredDeckId?: string | null;
}) {
  const preferredDeckId = options?.preferredDeckId ?? null;
  const [decks, setDecks] = useState<SavedDeckRow[]>([]);
  const [materialDecks, setMaterialDecks] = useState<SavedMaterialDeckRow[]>(
    [],
  );
  const [decksLoading, setDecksLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [deckSource, setDeckSource] = useState<DeckSource>("saved");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [deckText, setDeckText] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDecksLoading(true);
    Promise.all([fetchSavedDecks(), fetchSavedMaterialDecks()])
      .then(([deckRows, materialRows]) => {
        if (cancelled) {
          return;
        }
        setDecks(deckRows);
        setMaterialDecks(materialRows);
        setSelectedDeckId((current) => {
          if (
            preferredDeckId &&
            deckRows.some((deck) => deck.id === preferredDeckId)
          ) {
            return preferredDeckId;
          }
          if (current && deckRows.some((deck) => deck.id === current)) {
            return current;
          }
          return deckRows[0]?.id ?? "";
        });
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "Failed to load decks.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setDecksLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [preferredDeckId, reloadToken]);

  const reloadDecks = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const activeSavedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) ?? null,
    [decks, selectedDeckId],
  );

  const effectiveDeckText =
    deckSource === "saved" ? (activeSavedDeck?.text ?? "") : deckText;

  const deckAnalysis = useMemo(
    () => analyzeDecklist(effectiveDeckText),
    [effectiveDeckText],
  );

  const recognizedCount = deckAnalysis.recognizedCount;
  const canStart = recognizedCount >= OPENING_HAND_SIZE;

  const materials: DeckCounts = useMemo(() => {
    const linkedId = activeSavedDeck?.materialDeckId;
    const linked =
      linkedId != null && linkedId !== ""
        ? materialDecks.find((deck) => deck.id === linkedId)
        : null;
    const text = linked?.text ?? DEFAULT_MATERIAL_DECK_TEXT;
    return materialDeckCounts(parseMaterialDecklist(text));
  }, [activeSavedDeck, materialDecks]);

  /** Shuffle, draw opening hand, and coin-flip go-first on submit. */
  const buildStartRequest = useCallback(() => {
    const pile = cardsFromCounts(listToCounts(deckAnalysis.cards));
    if (pile.length < OPENING_HAND_SIZE) {
      return {
        error: `Need at least ${OPENING_HAND_SIZE} recognized cards.` as const,
      };
    }
    const orderedDeck = shuffleDeck(pile, makeSeed());
    const hand = orderedDeck.slice(0, OPENING_HAND_SIZE) as CardId[];
    const goFirst = Math.random() < 0.5;
    return {
      request: buildPlaytestInitRequest({
        hand,
        orderedDeck,
        goFirst,
        materials,
      }),
    };
  }, [deckAnalysis.cards, materials]);

  return {
    decks,
    decksLoading,
    loadError,
    reloadDecks,
    deckSource,
    setDeckSource,
    selectedDeckId,
    setSelectedDeckId,
    deckText,
    setDeckText,
    recognizedCount,
    canStart,
    deckAnalysis,
    buildStartRequest,
  };
}

export type SetupState = ReturnType<typeof useSetupState>;
