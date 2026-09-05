"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  analyzeDecklist,
  CARD_LIST,
  cardsFromCounts,
  isPlayableDeckCard,
  listToCounts,
  makeSeed,
  materialDeckCounts,
  normalizeSeed,
  OPENING_HAND_SIZE,
  parseMaterialDecklist,
  PLAY_MAX_TURNS,
  shuffleDeck,
  subtractCards,
  type CardId,
  type DeckCounts,
} from "@ga-fire/game";
import {
  fetchSavedDecks,
  fetchSavedMaterialDecks,
  type SavedDeckRow,
  type SavedMaterialDeckRow,
} from "./api";
import { buildPlaytestInitRequest } from "./build-init-request";

const DEFAULT_MATERIAL_DECK_TEXT = `1 Impact Hammer
1 Mercenary's Blade
1 Poisoned Dagger
1 Zander, Prepared Scout
1 Varuckan Soulknife`;

export type DeckSource = "saved" | "paste";

export function useSetupState() {
  const [decks, setDecks] = useState<SavedDeckRow[]>([]);
  const [materialDecks, setMaterialDecks] = useState<SavedMaterialDeckRow[]>(
    [],
  );
  const [decksLoading, setDecksLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [deckSource, setDeckSource] = useState<DeckSource>("saved");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [deckText, setDeckText] = useState("");

  const [seedInput, setSeedInput] = useState("");
  const [seed, setSeed] = useState<number | null>(null);
  const [orderedDeck, setOrderedDeck] = useState<CardId[]>([]);
  const [hand, setHand] = useState<CardId[]>([]);
  const [manualHand, setManualHand] = useState(false);

  const [goFirst, setGoFirst] = useState(true);

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
        if (deckRows.length > 0) {
          setSelectedDeckId((current) => current || deckRows[0]!.id);
        }
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
  const canShuffle = recognizedCount >= OPENING_HAND_SIZE;

  const materials: DeckCounts = useMemo(() => {
    const linkedId = activeSavedDeck?.materialDeckId;
    const linked =
      linkedId != null && linkedId !== ""
        ? materialDecks.find((deck) => deck.id === linkedId)
        : null;
    const text = linked?.text ?? DEFAULT_MATERIAL_DECK_TEXT;
    return materialDeckCounts(parseMaterialDecklist(text));
  }, [activeSavedDeck, materialDecks]);

  const playableCards = useMemo(
    () =>
      CARD_LIST.filter(isPlayableDeckCard).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [],
  );

  const shuffled = orderedDeck.length > 0;

  const dealFromSeed = useCallback(
    (nextSeed: number, keepHand = false) => {
      const pile = cardsFromCounts(listToCounts(deckAnalysis.cards));
      if (pile.length < OPENING_HAND_SIZE) {
        return `Need at least ${OPENING_HAND_SIZE} recognized cards to shuffle.`;
      }
      const ordered = shuffleDeck(pile, nextSeed);
      setSeed(nextSeed);
      setSeedInput(String(nextSeed >>> 0));
      setOrderedDeck(ordered);
      if (!keepHand || !manualHand) {
        setHand(ordered.slice(0, OPENING_HAND_SIZE));
        setManualHand(false);
      }
      return null;
    },
    [deckAnalysis.cards, manualHand],
  );

  const drawRandomHand = useCallback(() => {
    return dealFromSeed(makeSeed());
  }, [dealFromSeed]);

  const shuffleDeckOnly = useCallback(() => {
    return dealFromSeed(seed ?? makeSeed(), true);
  }, [dealFromSeed, seed]);

  const applySeedInput = useCallback(() => {
    const trimmed = seedInput.trim();
    if (!trimmed) {
      return dealFromSeed(makeSeed());
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      return "Seed must be a non-negative integer.";
    }
    return dealFromSeed(normalizeSeed(parsed), manualHand);
  }, [dealFromSeed, manualHand, seedInput]);

  const resetHandFromShuffle = useCallback(() => {
    if (orderedDeck.length < OPENING_HAND_SIZE) {
      return "Shuffle the deck before resetting the hand.";
    }
    setHand(orderedDeck.slice(0, OPENING_HAND_SIZE));
    setManualHand(false);
    return null;
  }, [orderedDeck]);

  const removeHandCard = useCallback((index: number) => {
    setHand((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setManualHand(true);
  }, []);

  const addHandCard = useCallback((id: CardId) => {
    setHand((current) => [...current, id]);
    setManualHand(true);
  }, []);

  const buildStartRequest = useCallback(() => {
    if (hand.length < 2) {
      return { error: "Add at least two cards before starting." as const };
    }
    if (orderedDeck.length === 0) {
      return {
        error: "Shuffle the deck first — draws come from the seeded pile.",
      } as const;
    }
    const remaining = subtractCards(orderedDeck, hand);
    if (remaining.length === 0 && hand.length < orderedDeck.length) {
      return {
        error: "Hand cards must exist in the shuffled deck.",
      } as const;
    }
    return {
      request: buildPlaytestInitRequest({
        hand,
        orderedDeck,
        goFirst,
        materials,
      }),
    };
  }, [goFirst, hand, materials, orderedDeck]);

  return {
    decks,
    decksLoading,
    loadError,
    deckSource,
    setDeckSource,
    selectedDeckId,
    setSelectedDeckId,
    deckText,
    setDeckText,
    seedInput,
    setSeedInput,
    seed,
    orderedDeck,
    hand,
    manualHand,
    goFirst,
    setGoFirst,
    recognizedCount,
    canShuffle,
    shuffled,
    playableCards,
    deckAnalysis,
    drawRandomHand,
    shuffleDeckOnly,
    applySeedInput,
    resetHandFromShuffle,
    removeHandCard,
    addHandCard,
    buildStartRequest,
  };
}

export type SetupState = ReturnType<typeof useSetupState>;
