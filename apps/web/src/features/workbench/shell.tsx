"use client";

import Link from "next/link";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CARDS,
  MAX_RATIO_DECK_ATTEMPTS,
  MIN_VALID_DECK_SIZE,
  PLAYABLE_CARD_IDS,
  analyzeDecklist,
  countLegalDecklists,
  deckAttemptPercent,
  listToCounts,
  parseDecklist,
  type CardId,
  type DeckCounts,
  type SimType,
  type SolveResult,
} from "@/lib/engine";
import { hydrateCardCatalogFromApi } from "@/lib/api/catalog";
import {
  fetchWorkerVersion,
  solve as apiSolve,
  type WorkerVersion,
} from "@/lib/api/client";
import { mergeOptimizeProgress, useRun, type OptimizeProgress } from "@/lib/api/useRun";
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
import { DRILL_3_HAND } from "@/lib/fixtures/drills";
import { DeckEditor, DeckResults } from "./panels/deck-solver";
import { DecksManage } from "./panels/decks-manage";
import { CardDatabasePanel } from "./panels/card-database";
import { HandBuilder, ResultRail } from "./panels/hand-solver";
import {
  CutBudgetPanel,
  PermutationPanel,
  RatioControls,
  RatioDeckPicker,
  RatioResults,
  ReplacementPoolPanel,
  snapshotRatioCriteria,
} from "./panels/ratios";
import { HistoryPanel } from "./panels/history";
import { InfoPanel } from "./panels/info";
import { ActionBar, PanelTopline } from "./ui";
import type {
  DeckResult,
  JobType,
  RatioRefineCriteria,
  RatioResult,
  SampleHand,
  SolverMode,
  Tab,
} from "./types";
import {
  cardsFromCounts,
  deckCountsCoveringHand,
  makeSeed,
  OPENING_HAND_SIZE,
  refineBounds,
  REFINE_COPY_CEILING,
  shuffleDeck,
  subtractCards,
} from "./utils";
import { workbenchHref } from "./routes";
import { getCachedDecks, setCachedDecks } from "./decks-cache";

export default function FizaWorkbench({
  tab,
  deckId: routeDeckId,
}: {
  tab: Tab;
  deckId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deckCache = getCachedDecks();
  const [hand, setHand] = useState<CardId[]>(DRILL_3_HAND);
  const [drawn, setDrawn] = useState<CardId[]>([]);
  const [orderedDeck, setOrderedDeck] = useState<CardId[]>([]);
  const [solveSeed, setSolveSeed] = useState(42);
  const [solverMode, setSolverMode] = useState<SolverMode>("hand");
  const [selectedCard, setSelectedCard] = useState<CardId>("arthur");
  const [goFirst, setGoFirst] = useState(true);
  const [turns, setTurns] = useState(3);
  const [simType, setSimType] = useState<SimType>("fire_brick");
  const [rollouts, setRollouts] = useState(12);
  const [lineResult, setLineResult] = useState<SolveResult | null>(null);
  const [decks, setDecks] = useState<SavedDeck[]>(deckCache.decks);
  const [decksHydrated, setDecksHydrated] = useState(deckCache.hydrated);
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [workerVersion, setWorkerVersion] = useState<WorkerVersion | null>(
    null,
  );
  const [isRenamingDeck, setIsRenamingDeck] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [samples, setSamples] = useState(8);
  const [deckResult, setDeckResult] = useState<DeckResult | null>(null);
  const [cutBudgets, setCutBudgets] = useState<
    Partial<Record<CardId, number>>
  >({});
  const [replacements, setReplacements] = useState<
    Partial<Record<CardId, number>>
  >({});
  const [deckAttempts, setDeckAttempts] = useState(32);
  const [ratioSamples, setRatioSamples] = useState(4);
  const [metric, setMetric] = useState<"mean" | "p50">("mean");
  const [ratioResult, setRatioResult] = useState<RatioResult | null>(null);
  const [ratioCriteria, setRatioCriteria] =
    useState<RatioRefineCriteria | null>(null);
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [busy, setBusy] = useState<JobType | null>(null);
  const [error, setError] = useState("");
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const { startStreamingRun, cancel: cancelRun } = useRun();

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
  const deferredDeckText = useDeferredValue(deckText);

  const ratioBaseCards = parseDecklist(deckText);
  const ratioRecognizedCount = ratioBaseCards.length;
  const ratioBaseCounts = listToCounts(ratioBaseCards);
  const deckSize = Math.min(60, Math.max(0, ratioBaseCards.length));
  const bounds = refineBounds(ratioBaseCounts, cutBudgets, replacements);
  const boundMinTotal = Object.values(bounds).reduce(
    (sum, item) => sum + item.min,
    0,
  );
  const boundMaxTotal = Object.values(bounds).reduce(
    (sum, item) => sum + item.max,
    0,
  );
  const freeCopies = Math.max(0, deckSize - boundMinTotal);
  const legalDecklists = countLegalDecklists(bounds, deckSize);
  const attemptCeiling =
    legalDecklists === BigInt(0)
      ? 0
      : Number(
          legalDecklists < BigInt(MAX_RATIO_DECK_ATTEMPTS)
            ? legalDecklists
            : BigInt(MAX_RATIO_DECK_ATTEMPTS),
        );
  const coveragePercent = deckAttemptPercent(deckAttempts, legalDecklists);
  const replacementCount = Object.keys(replacements).length;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await hydrateCardCatalogFromApi();
        if (cancelled) {
          return;
        }
        setSelectedCard((current) =>
          current in CARDS ? current : (PLAYABLE_CARD_IDS[0] ?? current),
        );
        setCatalogEpoch((epoch) => epoch + 1);
        const [store, version] = await Promise.all([
          loadDecksFromApi(),
          fetchWorkerVersion().catch(() => null),
        ]);
        if (cancelled) {
          return;
        }
        setDecks(store.decks);
        setCachedDecks(store.decks);
        setDecksHydrated(true);
        if (version) {
          setWorkerVersion(version);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load decks from the API.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!decksHydrated) {
      return;
    }
    setCachedDecks(decks);
  }, [decks, decksHydrated]);

  useEffect(() => {
    if (!decksHydrated || decks.length === 0) {
      return;
    }
    const valid = new Set(decks.map((deck) => deck.id));
    const resolved =
      routeDeckId && valid.has(routeDeckId)
        ? routeDeckId
        : loadActiveDeckId(decks);
    if (!routeDeckId || !valid.has(routeDeckId)) {
      const qs = searchParams.toString();
      router.replace(workbenchHref(tab, resolved, qs || undefined));
    }
  }, [decksHydrated, decks, routeDeckId, tab, router, searchParams]);

  useEffect(() => {
    if (!decksHydrated || !activeDeckId) {
      return;
    }
    saveActiveDeckId(activeDeckId);
  }, [activeDeckId, decksHydrated]);

  useEffect(() => {
    if (!decksHydrated) {
      return;
    }
    setDrawn([]);
    setOrderedDeck([]);
    setDeckResult(null);
    setRatioResult(null);
    setRatioCriteria(null);
    setError("");
    setIsRenamingDeck(false);
    setCutBudgets({});
    setReplacements({});
  }, [activeDeckId, decksHydrated]);

  useEffect(() => {
    const counts = listToCounts(parseDecklist(deckText));
    setReplacements((current) => {
      const nextEntries = Object.entries(current).filter(
        ([id]) => (counts[id as CardId] ?? 0) < REFINE_COPY_CEILING,
      );
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(nextEntries) as Partial<Record<CardId, number>>;
    });
  }, [deckText]);

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
  }, [activeDeck, decksHydrated]);

  function updateActiveDeckText(text: string) {
    if (!activeDeck || isDeckCardlistLocked(activeDeck)) {
      return;
    }
    setDecks((current) =>
      current.map((deck) =>
        deck.id === activeDeck.id ? { ...deck, text } : deck,
      ),
    );
    setDeckResult(null);
  }

  async function syncDeckRunCounts() {
    try {
      const remote = await refreshDecksRemote();
      setDecks((current) =>
        current.map((deck) => {
          const match = remote.find((row) => row.id === deck.id);
          return match
            ? { ...deck, runCount: match.runCount, deckHash: match.deckHash }
            : deck;
        }),
      );
    } catch {
      // Keep local state if refresh fails; API still enforces the lock.
    }
  }

  function navigateToDeck(deckId: string) {
    const qs = searchParams.toString();
    router.push(workbenchHref(tab, deckId, qs || undefined));
  }

  function switchDeck(deckId: string) {
    navigateToDeck(deckId);
  }

  async function saveRatioDecklist(
    counts: DeckCounts,
    score: number,
    rank: number,
  ) {
    const lines = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => {
        const byCount = b[1] - a[1];
        if (byCount !== 0) return byCount;
        const nameA = CARDS[a[0] as CardId]?.name ?? a[0];
        const nameB = CARDS[b[0] as CardId]?.name ?? b[0];
        return nameA.localeCompare(nameB);
      })
      .map(([id, count]) => `${count} ${CARDS[id as CardId]?.name ?? id}`);
    const text = `${lines.join("\n")}\n`;
    const name = nextDeckName(
      decks,
      `${ratioCriteria?.baseDeckName ?? activeDeck?.name ?? "Deck"} · Ratio #${rank} · ${score.toFixed(2)}`,
    );
    try {
      const deck = await createDeckRemote(name, text);
      setDecks((current) => [...current, deck]);
      navigateToDeck(deck.id);
      setError("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the deck.",
      );
    }
  }

  async function createNewDeck() {
    try {
      const deck = await createDeckRemote(nextDeckName(decks), "");
      setDecks((current) => [...current, deck]);
      navigateToDeck(deck.id);
      setDeckResult(null);
      setError("");
      setIsRenamingDeck(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create a deck.",
      );
    }
  }

  async function duplicateActiveDeck() {
    if (!activeDeck) {
      return;
    }
    try {
      const deck = await createDeckRemote(
        nextDeckName(decks, `${activeDeck.name} copy`),
        activeDeck.text,
      );
      setDecks((current) => [...current, deck]);
      navigateToDeck(deck.id);
      setDeckResult(null);
      setError("");
      setIsRenamingDeck(false);
    } catch (duplicateError) {
      setError(
        duplicateError instanceof Error
          ? duplicateError.message
          : "Could not duplicate the deck.",
      );
    }
  }

  function startRenamingDeck() {
    if (!activeDeck) {
      return;
    }
    setRenameDraft(activeDeck.name);
    setIsRenamingDeck(true);
  }

  function commitDeckRename() {
    if (!activeDeck) {
      return;
    }
    const name = normalizeDeckName(renameDraft);
    setDecks((current) =>
      current.map((deck) =>
        deck.id === activeDeck.id ? { ...deck, name } : deck,
      ),
    );
    setIsRenamingDeck(false);
  }

  function cancelDeckRename() {
    setIsRenamingDeck(false);
    setRenameDraft("");
  }

  async function deleteActiveDeck() {
    if (!activeDeck) {
      return;
    }
    try {
      await deleteDeckRemote(activeDeck.id);
      if (decks.length === 1) {
        const deck = await createDeckRemote(nextDeckName([]), "");
        setDecks([deck]);
        navigateToDeck(deck.id);
      } else {
        const remaining = decks.filter((deck) => deck.id !== activeDeck.id);
        setDecks(remaining);
        navigateToDeck(remaining[0]?.id ?? "");
      }
      setDeckResult(null);
      setError("");
      setIsRenamingDeck(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the deck.",
      );
    }
  }

  async function solveHand() {
    const known =
      solverMode === "deck" ? [...hand, ...drawn] : hand;
    if (known.length < 2) {
      setError("Add at least two cards to solve a line.");
      return;
    }
    const remainingQueue =
      solverMode === "deck" && orderedDeck.length > 0
        ? subtractCards(orderedDeck, known)
        : undefined;
    const needsDeck = simType !== "fire_brick" && remainingQueue === undefined;
    const deckCards = parseDecklist(deckText);
    if (needsDeck && deckCards.length < MIN_VALID_DECK_SIZE) {
      setError(
        `Monte Carlo, Two-pass, and Oracle need a maindeck (Decks tab) with at least ${MIN_VALID_DECK_SIZE} recognized cards.`,
      );
      return;
    }
    const deck =
      simType !== "fire_brick"
        ? deckCountsCoveringHand(deckCards, known)
        : undefined;
    setBusy("solve");
    setError("");
    try {
      const result = await apiSolve({
        hand: known,
        goFirst,
        maxTurns: turns,
        simType,
        rollouts,
        seed: solveSeed as unknown as bigint,
        ...(deck ? { deck } : {}),
        ...(remainingQueue !== undefined ? { queue: remainingQueue } : {}),
      } as Parameters<typeof apiSolve>[0]);
      startTransition(() => setLineResult(result as unknown as SolveResult));
    } catch (solveError) {
      setError(
        solveError instanceof Error
          ? solveError.message
          : "The line solve failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function evaluateCurrentDeck() {
    const cards = parseDecklist(deferredDeckText);
    if (cards.length < MIN_VALID_DECK_SIZE) {
      setError(
        `The decklist needs at least ${MIN_VALID_DECK_SIZE} recognized cards.`,
      );
      return;
    }
    const deckId = activeDeck?.id;
    if (!deckId) {
      setError("Save or select a deck before running deck damage.");
      return;
    }
    setBusy("evaluate");
    setError("");
    setProgress({
      decksScored: 0,
      totalDecks: 0,
      legalDecks: 0,
      handsSimulated: 0,
      totalHands: samples,
      bestScore: 0,
      ...(simType === "monte_carlo"
        ? { rolloutsDone: 0, totalRollouts: rollouts }
        : {}),
    });
    try {
      await startStreamingRun(
        "evaluate",
        {
          deck: listToCounts(cards),
          samples,
          goFirst,
          maxTurns: turns,
          simType,
          rollouts,
          seed: makeSeed() as unknown as bigint,
        },
        deckId,
        {
          onProgress: (progressUpdate) =>
            setProgress((current) => mergeOptimizeProgress(current, progressUpdate)),
          onComplete: (result) => {
            startTransition(() => setDeckResult(result as DeckResult));
            setProgress((current) =>
              current
                ? {
                    ...current,
                    handsSimulated: current.totalHands,
                    rolloutsDone: current.totalRollouts ?? current.rolloutsDone,
                  }
                : current,
            );
            void syncDeckRunCounts();
            setBusy(null);
            setHistoryEpoch((current) => current + 1);
          },
          onError: (message) => {
            setError(message);
            setBusy(null);
          },
        },
      );
    } catch (evaluateError) {
      setError(
        evaluateError instanceof Error
          ? evaluateError.message
          : "Deck evaluation failed.",
      );
      setBusy(null);
    }
  }

  function setCutBudget(id: CardId, cutUpTo: number) {
    setCutBudgets((current) => {
      const count = ratioBaseCounts[id] ?? 0;
      const nextCut = Math.min(count, Math.max(0, cutUpTo));
      if (nextCut <= 0) {
        const rest = { ...current };
        delete rest[id];
        return rest;
      }
      return { ...current, [id]: nextCut };
    });
  }

  function toggleReplacement(id: CardId) {
    if ((ratioBaseCounts[id] ?? 0) >= REFINE_COPY_CEILING) {
      return;
    }
    setReplacements((current) => {
      if (current[id] != null) {
        const rest = { ...current };
        delete rest[id];
        return rest;
      }
      return { ...current, [id]: REFINE_COPY_CEILING };
    });
  }

  function setReplacementMax(id: CardId, max: number) {
    setReplacements((current) => {
      if (current[id] == null) {
        return current;
      }
      const nextMax = Math.min(REFINE_COPY_CEILING, Math.max(1, max));
      return { ...current, [id]: nextMax };
    });
  }

  async function optimizeCurrentBounds() {
    if (ratioRecognizedCount < MIN_VALID_DECK_SIZE) {
      setError(
        `Select a deck with at least ${MIN_VALID_DECK_SIZE} recognized cards.`,
      );
      return;
    }
    const min = Object.values(bounds).reduce((sum, item) => sum + item.min, 0);
    const max = Object.values(bounds).reduce((sum, item) => sum + item.max, 0);
    if (deckSize < min || deckSize > max) {
      setError(`Deck size must be between the bound totals (${min}–${max}).`);
      return;
    }
    if (freeCopies > 0 && replacementCount === 0) {
      setError("Pick at least one replacement card to fill cut slots.");
      return;
    }
    const legal = countLegalDecklists(bounds, deckSize);
    if (legal === BigInt(0)) {
      setError("No legal lists exist for these cuts and replacements.");
      return;
    }
    const deckCount = Math.min(
      deckAttempts,
      MAX_RATIO_DECK_ATTEMPTS,
      Number(
        legal > BigInt(Number.MAX_SAFE_INTEGER)
          ? BigInt(MAX_RATIO_DECK_ATTEMPTS)
          : legal,
      ),
    );
    if (deckCount < 1) {
      setError("Choose at least one deck to attempt.");
      return;
    }
    const deckId = activeDeck?.id;
    if (!deckId) {
      setError("Save or select a deck before running the ratio lab.");
      return;
    }
    setBusy("optimize");
    setError("");
    setRatioResult(null);
    setRatioCriteria(
      snapshotRatioCriteria(
        activeDeck?.name ?? "Base deck",
        ratioBaseCounts,
        cutBudgets,
        replacements,
      ),
    );
    setProgress({
      decksScored: 0,
      totalDecks: deckCount,
      legalDecks:
        legal > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(legal),
      handsSimulated: 0,
      totalHands: deckCount * ratioSamples,
      bestScore: 0,
    });
    try {
      await startStreamingRun(
        "optimize",
        {
          bounds,
          deckSize,
          samples: ratioSamples,
          decks: deckCount,
          metric,
          seed: makeSeed() as unknown as bigint,
        },
        deckId,
        {
          onProgress: (progressUpdate) =>
            setProgress((current) => mergeOptimizeProgress(current, progressUpdate)),
          onComplete: (result) => {
            const ratio = result as RatioResult;
            startTransition(() => setRatioResult(ratio));
            setProgress((current) =>
              current
                ? {
                    ...current,
                    decksScored: current.totalDecks,
                    handsSimulated: current.totalHands,
                    bestScore: ratio.bestScore,
                  }
                : current,
            );
            void syncDeckRunCounts();
            setBusy(null);
            setHistoryEpoch((current) => current + 1);
          },
          onError: (message) => {
            setError(message);
            setBusy(null);
          },
        },
      );
    } catch (optimizeError) {
      setError(
        optimizeError instanceof Error
          ? optimizeError.message
          : "Deck optimization failed.",
      );
      setBusy(null);
    }
  }

  function cancelJob() {
    void cancelRun();
    setBusy(null);
    setProgress(null);
    setError("Calculation cancelled.");
  }

  function sendSampleToHandSolver(sample: SampleHand) {
    setHand([...sample.hand]);
    setDrawn([]);
    setOrderedDeck([]);
    setSolverMode("hand");
    setSimType(deckResult?.simType ?? simType);
    setLineResult({
      simType: deckResult?.simType ?? simType,
      maxDamage: sample.damage,
      endInfluence:
        sample.endInfluence ??
        sample.twoPass?.brick.endInfluence ??
        0,
      events: sample.events,
      nodes: sample.nodes,
      distribution: sample.distribution,
      twoPass: sample.twoPass,
    });
    router.push(workbenchHref("line", activeDeckId));
    setError("");
  }

  function dealShuffledPile(seed: number) {
    const pile = cardsFromCounts(listToCounts(parseDecklist(deckText)));
    if (pile.length < OPENING_HAND_SIZE) {
      setError(
        `Need at least ${OPENING_HAND_SIZE} recognized cards in the selected deck to draw a hand.`,
      );
      return;
    }
    const ordered = shuffleDeck(pile, seed);
    setSolveSeed(seed);
    setOrderedDeck(ordered);
    setHand(ordered.slice(0, OPENING_HAND_SIZE));
    setDrawn([]);
    setLineResult(null);
    setError("");
  }

  function drawRandomHandFromDeck() {
    dealShuffledPile(makeSeed());
  }

  function shuffleDeckFromSeed() {
    dealShuffledPile(makeSeed());
  }

  function drawCardFromDeck() {
    let pile = orderedDeck;
    if (pile.length === 0) {
      const cards = cardsFromCounts(listToCounts(parseDecklist(deckText)));
      if (cards.length === 0) {
        setError("The selected deck has no recognized cards to draw.");
        return;
      }
      const seed = makeSeed();
      pile = shuffleDeck(cards, seed);
      setSolveSeed(seed);
      setOrderedDeck(pile);
    }
    const remaining = subtractCards(pile, [...hand, ...drawn]);
    const next = remaining[0];
    if (!next) {
      setError("No cards left in the deck to draw.");
      return;
    }
    setDrawn([...drawn, next]);
    setLineResult(null);
    setError("");
  }

  const deckAnalysis = analyzeDecklist(deferredDeckText);
  const recognizedDeckCount = deckAnalysis.recognizedCount;
  const unrecognizedLines = deckAnalysis.unrecognizedLines;
  const remainingCount = subtractCards(
    orderedDeck.length > 0 ? orderedDeck : deckAnalysis.cards,
    [...hand, ...drawn],
  ).length;

  useEffect(() => {
    if (attemptCeiling < 1) return;
    setDeckAttempts((current) =>
      Math.min(Math.max(1, current), attemptCeiling),
    );
  }, [attemptCeiling]);

  return (
    <main className="workbench">
      <header className="masthead">
        <div className="brand-lockup" aria-label="Fireline Grand Archive math">
          <span className="brand-mark">F</span>
          <div>
            <p>Grand Archive math</p>
            <h1>FIRELINE</h1>
          </div>
        </div>
      </header>

      <nav className="mode-switcher" aria-label="Calculator modes">
        {(
          [
            ["line", "Hand solver"],
            ["manage", "Decks"],
            ["deck", "Deck damage"],
            ["ratios", "Ratio lab"],
            ["cards", "Card database"],
            ["history", "History"],
            ["info", "Information"],
          ] as const
        ).map(([id, label]) => (
          <Link
            className={tab === id ? "active" : ""}
            href={workbenchHref(id, activeDeckId || undefined)}
            key={id}
            onClick={() => {
              setError("");
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="tool-plane" key={catalogEpoch}>
        {tab === "line" && (
          <HandBuilder
            hand={hand}
            drawn={drawn}
            solverMode={solverMode}
            selectedCard={selectedCard}
            decks={decks}
            activeDeck={activeDeck}
            recognizedDeckCount={recognizedDeckCount}
            remainingCount={remainingCount}
            shuffled={orderedDeck.length > 0}
            seed={solveSeed}
            goFirst={goFirst}
            turns={turns}
            simType={simType}
            rollouts={rollouts}
            busy={busy === "solve"}
            onHandChange={setHand}
            onDrawnChange={(next) => {
              if (next.length === drawn.length + 1) {
                const added = next[next.length - 1];
                const remaining = subtractCards(orderedDeck, [...hand, ...drawn]);
                if (!added || !remaining.includes(added)) {
                  setError("That card is not left in the shuffled pile.");
                  return;
                }
              }
              setDrawn(next);
              setLineResult(null);
              setError("");
            }}
            onSolverModeChange={(mode) => {
              setSolverMode(mode);
              setLineResult(null);
            }}
            onSelectedCardChange={setSelectedCard}
            onSwitchDeck={switchDeck}
            onDrawRandomHand={drawRandomHandFromDeck}
            onDrawCard={drawCardFromDeck}
            onShuffleDeck={shuffleDeckFromSeed}
            onGoFirstChange={setGoFirst}
            onTurnsChange={setTurns}
            onSimTypeChange={(value) => {
              setSimType(value);
              setLineResult(null);
            }}
            onRolloutsChange={setRollouts}
            onSolve={solveHand}
            onCancel={cancelJob}
            decksLoading={!decksHydrated}
          />
        )}

        {tab === "line" && (
          <ResultRail result={lineResult} busy={busy === "solve"} hand={hand} />
        )}

        {tab === "manage" && (
          <DecksManage
            decks={decks}
            activeDeck={activeDeck}
            deckText={deckText}
            deckCards={deckAnalysis.cards}
            recognizedDeckCount={recognizedDeckCount}
            unrecognizedLines={unrecognizedLines}
            isRenamingDeck={isRenamingDeck}
            renameDraft={renameDraft}
            onSwitchDeck={switchDeck}
            onCreateDeck={createNewDeck}
            onDuplicateDeck={duplicateActiveDeck}
            onStartRename={startRenamingDeck}
            onDeleteDeck={deleteActiveDeck}
            onRenameDraftChange={setRenameDraft}
            onCommitRename={commitDeckRename}
            onCancelRename={cancelDeckRename}
            onDeckTextChange={updateActiveDeckText}
            decksLoading={!decksHydrated}
          />
        )}

        {tab === "deck" && (
          <DeckEditor
            decks={decks}
            activeDeck={activeDeck}
            recognizedDeckCount={recognizedDeckCount}
            samples={samples}
            goFirst={goFirst}
            turns={turns}
            simType={simType}
            rollouts={rollouts}
            busy={busy === "evaluate"}
            onSwitchDeck={switchDeck}
            onSamplesChange={setSamples}
            onGoFirstChange={setGoFirst}
            onTurnsChange={setTurns}
            onSimTypeChange={(value) => {
              setSimType(value);
              setDeckResult(null);
            }}
            onRolloutsChange={setRollouts}
            onEvaluate={evaluateCurrentDeck}
            onCancel={cancelJob}
            progress={progress}
            decksLoading={!decksHydrated}
          />
        )}

        {tab === "deck" && (
          <DeckResults
            result={deckResult}
            busy={busy === "evaluate"}
            onSendToHandSolver={sendSampleToHandSolver}
          />
        )}

        {tab === "ratios" && (
          <div className="ratio-mode">
            <PanelTopline kicker="DECK REFINEMENT">
              Start from a saved list, open cut budgets on cards you may trim,
              pick a global replacement pool for the freed slots, then sample
              unique legal lists by opening-hand damage.
            </PanelTopline>
            <RatioDeckPicker
              decks={decks}
              activeDeck={activeDeck}
              recognizedCount={ratioRecognizedCount}
              onSwitchDeck={switchDeck}
              decksLoading={!decksHydrated}
            />
            <CutBudgetPanel
              baseCounts={ratioBaseCounts}
              cutBudgets={cutBudgets}
              onCutBudgetChange={setCutBudget}
            />
            <ReplacementPoolPanel
              baseCounts={ratioBaseCounts}
              replacements={replacements}
              onToggle={toggleReplacement}
              onMaxChange={setReplacementMax}
            />
            <PermutationPanel
              legalDecklists={legalDecklists}
              boundMinTotal={boundMinTotal}
              boundMaxTotal={boundMaxTotal}
              deckSize={deckSize}
              freeCopies={freeCopies}
              deckAttempts={deckAttempts}
              attemptCeiling={attemptCeiling}
              coveragePercent={coveragePercent}
              busy={busy === "optimize"}
              progress={progress}
              onDeckAttemptsChange={setDeckAttempts}
            />
            <RatioControls
              deckSize={deckSize}
              ratioSamples={ratioSamples}
              metric={metric}
              onRatioSamplesChange={setRatioSamples}
              onMetricChange={setMetric}
            />
            <ActionBar
              label="Sample ratio space"
              busy={busy === "optimize"}
              onRun={optimizeCurrentBounds}
              onCancel={cancelJob}
              progress={progress}
            />
            <RatioResults
              result={ratioResult}
              criteria={ratioCriteria}
              onSaveDecklist={saveRatioDecklist}
            />          </div>
        )}

        {tab === "history" && (
          <HistoryPanel
            decks={decks}
            routeDeckId={routeDeckId}
            refreshToken={historyEpoch}
            onSwitchDeck={switchDeck}
          />
        )}

        {tab === "cards" && <CardDatabasePanel workerVersion={workerVersion} />}

        {tab === "info" && <InfoPanel />}

        {error && tab !== "history" && tab !== "info" && tab !== "cards" && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </section>

      <footer>
        <span>
          {workerVersion
            ? `r${workerVersion.rules} · s${workerVersion.sampler} · a${workerVersion.attribution} · digest ${String(workerVersion.cardDigest).slice(0, 8)} · ${workerVersion.build}`
            : "—"}
        </span>
      </footer>
    </main>
  );
}
