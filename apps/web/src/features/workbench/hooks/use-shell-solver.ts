"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  analyzeDecklist,
  listToCounts,
  MAX_RATIO_DECK_ATTEMPTS,
  MIN_VALID_DECK_SIZE,
  parseDecklist,
  PLAYABLE_CARD_IDS,
  type CardId,
  type SimType,
  type SolveResult,
} from "@/lib/engine";
import { DEFAULT_BUDGET } from "@/lib/budget";
import { solve as apiSolve } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { OptimizeProgress } from "@/lib/runs/types";
import { useRunTracker } from "@/lib/runs/run-tracker";
import { DRILL_3_HAND } from "@/lib/fixtures/drills";
import type { SavedDeck } from "@/lib/decks";
import type { JobType, SampleHand, SolverMode } from "../types";
import type { UseRatioStateResult } from "./use-ratio-state";
import {
  cardsFromCounts,
  deckCountsCoveringHand,
  makeSeed,
  OPENING_HAND_SIZE,
  shuffleDeck,
  subtractCards,
} from "../utils";
import { workbenchHref } from "../routes";

type UseShellSolverOptions = Readonly<{
  deckText: string;
  activeDeck: SavedDeck | null;
  activeDeckId: string;
  activeMaterialCounts: ReturnType<typeof listToCounts>;
  runParam: string | null;
  ratio: UseRatioStateResult;
  router: AppRouterInstance;
  syncDeckRunCounts: () => Promise<void>;
  decksHydrated: boolean;
}>;

export type ShellSolverState = Readonly<{
  hand: CardId[];
  drawn: CardId[];
  orderedDeck: CardId[];
  solveSeed: number;
  solverMode: SolverMode;
  selectedCard: CardId;
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  lineResult: SolveResult | null;
  samples: number;
  busy: JobType | null;
  error: string;
  historyEpoch: number;
  evaluateBusy: boolean;
  optimizeBusy: boolean;
  evaluateRun: ReturnType<ReturnType<typeof useRunTracker>["getRunForDeck"]>;
  optimizeRun: ReturnType<ReturnType<typeof useRunTracker>["getRunForDeck"]>;
  recognizedDeckCount: number;
  unrecognizedLines: string[];
  remainingCount: number;
  deckAnalysisCards: CardId[];
}>;

export type ShellSolverActions = Readonly<{
  setHand: (value: CardId[]) => void;
  setDrawn: (value: CardId[]) => void;
  setSolverMode: (value: SolverMode) => void;
  setSelectedCard: Dispatch<SetStateAction<CardId>>;
  setGoFirst: (value: boolean) => void;
  setTurns: (value: number) => void;
  setSimType: (value: SimType) => void;
  setRollouts: (value: number) => void;
  setLineResult: (value: SolveResult | null) => void;
  setSamples: (value: number) => void;
  setError: (value: string) => void;
  solveHand: () => Promise<void>;
  evaluateCurrentDeck: () => Promise<void>;
  optimizeCurrentBounds: () => Promise<void>;
  cancelHandSolve: () => void;
  cancelEvaluateJob: () => void;
  cancelOptimizeJob: () => void;
  sendSampleToHandSolver: (sample: SampleHand) => void;
  drawRandomHandFromDeck: () => void;
  drawCardFromDeck: () => void;
  shuffleDeckFromSeed: () => void;
  onDrawnChange: (next: CardId[]) => void;
  onSolverModeChange: (mode: SolverMode) => void;
  onSimTypeChange: (value: SimType) => void;
}>;

export type UseShellSolverResult = ShellSolverState & ShellSolverActions;

export function useShellSolver({
  deckText,
  activeDeck,
  activeDeckId,
  activeMaterialCounts,
  runParam,
  ratio,
  router,
  syncDeckRunCounts,
  decksHydrated,
}: UseShellSolverOptions): UseShellSolverResult {
  const queryClient = useQueryClient();
  const deferredDeckText = useDeferredValue(deckText);
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
  const [samples, setSamples] = useState(8);
  const [busy, setBusy] = useState<JobType | null>(null);
  const [error, setError] = useState("");
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const {
    workerReachable,
    getRunForDeck,
    startEvaluate,
    startOptimize,
    cancelRun: cancelWorkerRun,
  } = useRunTracker();
  const completedRunIdsRef = useRef<Set<string>>(new Set());

  const evaluateRun = activeDeckId
    ? getRunForDeck(activeDeckId, "evaluate", runParam)
    : null;
  const optimizeRun = activeDeckId
    ? getRunForDeck(activeDeckId, "optimize", runParam)
    : null;
  const evaluateBusy =
    evaluateRun?.status === "queued" || evaluateRun?.status === "running";
  const optimizeBusy =
    optimizeRun?.status === "queued" || optimizeRun?.status === "running";

  const deckAnalysis = analyzeDecklist(deferredDeckText);
  const recognizedDeckCount = deckAnalysis.recognizedCount;
  const unrecognizedLines = deckAnalysis.unrecognizedLines;
  const remainingCount = subtractCards(
    orderedDeck.length > 0 ? orderedDeck : deckAnalysis.cards,
    [...hand, ...drawn],
  ).length;

  useEffect(() => {
    if (evaluateRun?.status !== "complete" || !evaluateRun.id) {
      return;
    }
    if (completedRunIdsRef.current.has(evaluateRun.id)) {
      return;
    }
    completedRunIdsRef.current.add(evaluateRun.id);
    void syncDeckRunCounts();
    setHistoryEpoch((current) => current + 1);
    void queryClient.invalidateQueries({ queryKey: ["history"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cardDatabase("", "") });
  }, [evaluateRun?.id, evaluateRun?.status, queryClient, syncDeckRunCounts]);

  useEffect(() => {
    const runError = evaluateRun?.error ?? optimizeRun?.error;
    if (runError) {
      setError(runError);
    }
  }, [evaluateRun?.error, optimizeRun?.error]);

  useEffect(() => {
    if (!decksHydrated) {
      return;
    }
    setDrawn([]);
    setOrderedDeck([]);
    setError("");
  }, [activeDeckId, decksHydrated]);

  async function solveHand() {
    if (hand.length < 2) {
      setError("Add at least two cards to solve a line.");
      return;
    }
    // Opening hand only — drawn cards are known upcoming library draws, not
    // extra cards in hand for the line.
    const remainingQueue =
      solverMode === "deck" && orderedDeck.length > 0
        ? [...drawn, ...subtractCards(orderedDeck, [...hand, ...drawn])]
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
      deckCards.length >= MIN_VALID_DECK_SIZE
        ? deckCountsCoveringHand(deckCards, hand)
        : undefined;
    setBusy("solve");
    setError("");
    try {
      const result = await apiSolve({
        hand,
        goFirst,
        maxTurns: turns,
        simType,
        rollouts,
        seed: solveSeed as unknown as bigint,
        materials: activeMaterialCounts,
        deck: deck ?? {},
        queue: remainingQueue ?? null,
        budget: DEFAULT_BUDGET,
      });
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
    if (evaluateBusy) {
      return;
    }
    if (!workerReachable) {
      setError("The simulation worker is offline. Try again when it is back.");
      return;
    }
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
    setError("");
    const initialProgress: OptimizeProgress = {
      decksScored: 0,
      totalDecks: 0,
      legalDecks: 0,
      handsSimulated: 0,
      totalHands: samples,
      bestScore: 0,
      hands: [],
      ...(simType === "monte_carlo"
        ? { rolloutsDone: 0, totalRollouts: rollouts }
        : {}),
    };
    try {
      await startEvaluate(
        deckId,
        activeDeck.name,
        {
          deck: listToCounts(cards),
          samples,
          goFirst,
          maxTurns: turns,
          simType,
          rollouts,
          seed: makeSeed() as unknown as bigint,
          budget: DEFAULT_BUDGET,
        },
        initialProgress,
      );
    } catch (evaluateError) {
      setError(
        evaluateError instanceof Error
          ? evaluateError.message
          : "Deck evaluation failed.",
      );
    }
  }

  async function optimizeCurrentBounds() {
    if (optimizeBusy) {
      return;
    }
    if (!workerReachable) {
      setError("The simulation worker is offline. Try again when it is back.");
      return;
    }
    if (ratio.ratioRecognizedCount < MIN_VALID_DECK_SIZE) {
      setError(
        `Select a deck with at least ${MIN_VALID_DECK_SIZE} recognized cards.`,
      );
      return;
    }
    const deckId = activeDeck?.id;
    if (!deckId) {
      setError("Save or select a deck before running the ratio lab.");
      return;
    }

    if (ratio.ratioStrategy === "swapSweep") {
      if (!ratio.swapFrom) {
        setError("Pick a swappable card for swap sweep.");
        return;
      }
      const fromCount = ratio.ratioBaseCounts[ratio.swapFrom] ?? 0;
      const count = Math.min(Math.max(1, ratio.swapCount), fromCount);
      const candidates = PLAYABLE_CARD_IDS.filter(
        (id) =>
          ratio.swapCandidates[id] &&
          id !== ratio.swapFrom &&
          (ratio.ratioBaseCounts[id] ?? 0) === 0,
      );
      if (candidates.length === 0) {
        setError("Pick at least one candidate card not already in the deck.");
        return;
      }
      if (count > 4) {
        setError("Swap count cannot exceed 4 copies.");
        return;
      }
      const deckCount = 1 + candidates.length;
      setError("");
      ratio.setRatioCriteria(null);
      const initialProgress: OptimizeProgress = {
        decksScored: 0,
        totalDecks: deckCount,
        legalDecks: deckCount,
        handsSimulated: 0,
        totalHands: deckCount * ratio.ratioSamples,
        bestScore: 0,
      };
      try {
        await startOptimize(
          deckId,
          activeDeck.name,
          {
            bounds: {},
            deckSize: ratio.deckSize,
            samples: ratio.ratioSamples,
            decks: deckCount,
            metric: ratio.metric,
            strategy: ratio.ratioStrategy,
            baseDeck: ratio.ratioBaseCounts,
            swap: { from: ratio.swapFrom, count, candidates },
            seed: makeSeed() as unknown as bigint,
            materials: activeMaterialCounts,
            budget: DEFAULT_BUDGET,
          },
          initialProgress,
        );
      } catch (optimizeError) {
        setError(
          optimizeError instanceof Error
            ? optimizeError.message
            : "Swap sweep failed.",
        );
      }
      return;
    }

    const min = Object.values(ratio.bounds).reduce(
      (sum, item) => sum + item.min,
      0,
    );
    const max = Object.values(ratio.bounds).reduce(
      (sum, item) => sum + item.max,
      0,
    );
    if (ratio.deckSize < min || ratio.deckSize > max) {
      setError(`Deck size must be between the bound totals (${min}–${max}).`);
      return;
    }
    if (ratio.freeCopies > 0 && ratio.replacementCount === 0) {
      setError("Pick at least one replacement card to fill cut slots.");
      return;
    }
    const legal = ratio.legalDecklists;
    if (legal === BigInt(0)) {
      setError("No legal lists exist for these cuts and replacements.");
      return;
    }
    const deckCount = Math.min(
      ratio.deckAttempts,
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
    setError("");
    ratio.setRatioCriteria(
      ratio.snapshotCriteria(activeDeck?.name ?? "Base deck"),
    );
    const initialProgress: OptimizeProgress = {
      decksScored: 0,
      totalDecks: deckCount,
      legalDecks:
        legal > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(legal),
      handsSimulated: 0,
      totalHands: deckCount * ratio.ratioSamples,
      bestScore: 0,
    };
    try {
      await startOptimize(
        deckId,
        activeDeck.name,
        {
          bounds: ratio.bounds,
          deckSize: ratio.deckSize,
          samples: ratio.ratioSamples,
          decks: deckCount,
          metric: ratio.metric,
          strategy: ratio.ratioStrategy,
          baseDeck: {},
          swap: null,
          seed: makeSeed() as unknown as bigint,
          materials: activeMaterialCounts,
          budget: DEFAULT_BUDGET,
        },
        initialProgress,
      );
    } catch (optimizeError) {
      setError(
        optimizeError instanceof Error
          ? optimizeError.message
          : "Deck optimization failed.",
      );
    }
  }

  function cancelHandSolve() {
    setBusy(null);
    setError("Calculation cancelled.");
  }

  function cancelEvaluateJob() {
    if (!evaluateRun || (evaluateRun.status !== "queued" && evaluateRun.status !== "running")) {
      return;
    }
    void cancelWorkerRun(evaluateRun.id);
    setError("Calculation cancelled.");
  }

  function cancelOptimizeJob() {
    if (!optimizeRun || (optimizeRun.status !== "queued" && optimizeRun.status !== "running")) {
      return;
    }
    void cancelWorkerRun(optimizeRun.id);
    setError("Calculation cancelled.");
  }

  function sendSampleToHandSolver(sample: SampleHand) {
    const deckEval = evaluateRun?.deckResult;
    setHand([...sample.hand]);
    setDrawn([]);
    setOrderedDeck([]);
    setSolverMode("hand");
    setSimType(deckEval?.simType ?? simType);
    setLineResult({
      simType: deckEval?.simType ?? simType,
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

  function onDrawnChange(next: CardId[]) {
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
  }

  function onSolverModeChange(mode: SolverMode) {
    setSolverMode(mode);
    setLineResult(null);
  }

  function onSimTypeChange(value: SimType) {
    setSimType(value);
    setLineResult(null);
  }

  return {
    hand,
    drawn,
    orderedDeck,
    solveSeed,
    solverMode,
    selectedCard,
    goFirst,
    turns,
    simType,
    rollouts,
    lineResult,
    samples,
    busy,
    error,
    historyEpoch,
    evaluateBusy,
    optimizeBusy,
    evaluateRun,
    optimizeRun,
    recognizedDeckCount,
    unrecognizedLines,
    remainingCount,
    deckAnalysisCards: deckAnalysis.cards,
    setHand,
    setDrawn,
    setSolverMode,
    setSelectedCard,
    setGoFirst,
    setTurns,
    setSimType,
    setRollouts,
    setLineResult,
    setSamples,
    setError,
    solveHand,
    evaluateCurrentDeck,
    optimizeCurrentBounds,
    cancelHandSolve,
    cancelEvaluateJob,
    cancelOptimizeJob,
    sendSampleToHandSolver,
    drawRandomHandFromDeck,
    drawCardFromDeck,
    shuffleDeckFromSeed,
    onDrawnChange,
    onSolverModeChange,
    onSimTypeChange,
  };
}
