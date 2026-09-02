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
  type DeckCounts,
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
import type { JobType, LineHorizon, SampleHand, SolverMode, Turn2KillResults } from "../types";
import type { ImportedLine } from "../lib/import-line-tape";
import { DEFAULT_TURN2_KILL_THRESHOLD } from "../types";
import type { UseRatioStateResult } from "./use-ratio-state";
import {
  cardsFromCounts,
  deckCountsCoveringHand,
  makeSeed,
  normalizeSeed,
  OPENING_HAND_SIZE,
  resolveRunSeed,
  shuffleDeck,
  subtractCards,
} from "../utils";
import { workbenchHref } from "../routes";
import { solveTurn2KillPair, buildSolveQueue, oracleSolveRequest } from "../lib/turn-2-kill-solve";

function advancedRunFields(
  simType: SimType,
  maxThreads: number | null,
  glimpseEnabled: boolean,
  maxHandDurationSecs: number | null,
  maxCardDraw: number | null,
) {
  return {
    maxThreads,
    glimpseEnabled: simType === "fire_brick" ? false : glimpseEnabled,
    maxHandDurationSecs:
      maxHandDurationSecs != null && maxHandDurationSecs > 0
        ? maxHandDurationSecs
        : null,
    maxCardDraw:
      maxCardDraw != null && maxCardDraw > 0 ? maxCardDraw : null,
  };
}

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
  sampleSeed: number | null;
  solverMode: SolverMode;
  selectedCard: CardId;
  goFirst: boolean;
  turns: number;
  turn2KillEnabled: boolean;
  turn2KillThreshold: number;
  simType: SimType;
  rollouts: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  cpuCount: number;
  lineResult: SolveResult | null;
  /** Opening hand that produced `lineResult` (not the live builder hand). */
  lineHand: CardId[];
  turn2KillResults: Turn2KillResults | null;
  lineHorizon: LineHorizon;
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
  setTurn2KillEnabled: (value: boolean) => void;
  setTurn2KillThreshold: (value: number) => void;
  setLineHorizon: (value: LineHorizon) => void;
  setSimType: (value: SimType) => void;
  setRollouts: (value: number) => void;
  setMaxThreads: (value: number | null) => void;
  setGlimpseEnabled: (value: boolean) => void;
  setMaxHandDurationSecs: (value: number | null) => void;
  setMaxCardDraw: (value: number | null) => void;
  setLineResult: (value: SolveResult | null, evaluatedHand?: CardId[]) => void;
  setSamples: (value: number) => void;
  setError: (value: string) => void;
  solveHand: () => Promise<void>;
  evaluateCurrentDeck: () => Promise<void>;
  optimizeCurrentBounds: () => Promise<void>;
  optimizeMultiDeck: (deckLists: readonly DeckCounts[]) => Promise<void>;
  cancelHandSolve: () => void;
  cancelEvaluateJob: () => void;
  saveEvaluateJob: () => void;
  cancelOptimizeJob: () => void;
  saveOptimizeJob: () => void;
  sendSampleToHandSolver: (sample: SampleHand) => void;
  importLine: (line: ImportedLine) => void;
  drawRandomHandFromDeck: () => void;
  drawCardFromDeck: () => void;
  shuffleDeckFromSeed: () => void;
  applySolveSeed: (seed: number | null) => void;
  applySampleSeed: (seed: number | null) => void;
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
  const [sampleSeed, setSampleSeed] = useState<number | null>(null);
  const [solverMode, setSolverMode] = useState<SolverMode>("hand");
  const [selectedCard, setSelectedCard] = useState<CardId>("arthur");
  const [goFirst, setGoFirst] = useState(true);
  const [turns, setTurns] = useState(3);
  const [turn2KillEnabled, setTurn2KillEnabled] = useState(false);
  const [turn2KillThreshold, setTurn2KillThreshold] = useState(
    DEFAULT_TURN2_KILL_THRESHOLD,
  );
  const [simType, setSimType] = useState<SimType>("fire_brick");
  const [rollouts, setRollouts] = useState(12);
  const [maxThreads, setMaxThreads] = useState<number | null>(null);
  const [glimpseEnabled, setGlimpseEnabled] = useState(true);
  const [maxHandDurationSecs, setMaxHandDurationSecs] = useState<number | null>(
    null,
  );
  const [maxCardDraw, setMaxCardDraw] = useState<number | null>(null);
  const [lineResult, setLineResultState] = useState<SolveResult | null>(null);
  const [lineHand, setLineHand] = useState<CardId[]>([]);
  const [turn2KillResults, setTurn2KillResults] =
    useState<Turn2KillResults | null>(null);
  const [lineHorizon, setLineHorizonState] = useState<LineHorizon>(3);
  const [samples, setSamples] = useState(8);
  const [busy, setBusy] = useState<JobType | null>(null);
  const [error, setError] = useState("");
  const [historyEpoch, setHistoryEpoch] = useState(0);

  function setLineResult(value: SolveResult | null, evaluatedHand?: CardId[]) {
    setLineResultState(value);
    setLineHand(value && evaluatedHand ? [...evaluatedHand] : []);
  }

  function clearLineResults() {
    setLineResult(null);
    setTurn2KillResults(null);
    setLineHorizonState(3);
  }

  function setLineHorizon(horizon: LineHorizon) {
    setLineHorizonState(horizon);
    if (turn2KillResults) {
      setLineResultState(
        horizon === 2 ? turn2KillResults.turn2 : turn2KillResults.turn3,
      );
    }
  }

  const {
    workerReachable,
    cpuCount,
    getRunForDeck,
    startEvaluate,
    startOptimize,
    cancelRun: cancelWorkerRun,
    saveRun: saveWorkerRun,
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
    if (
      (evaluateRun?.status !== "complete" && evaluateRun?.status !== "partial") ||
      !evaluateRun.id
    ) {
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
    // Snapshot before the await — the builder hand can change while solving.
    const evaluatedHand = [...hand];
    setBusy("solve");
    setError("");
    setTurn2KillResults(null);
    setLineHorizonState(3);
    try {
      const requestBase = {
        hand: evaluatedHand,
        goFirst,
        simType,
        rollouts,
        seed: solveSeed as unknown as bigint,
        materials: activeMaterialCounts,
        deck: deck ?? {},
        queue: remainingQueue ?? null,
        budget: DEFAULT_BUDGET,
        ...advancedRunFields(
          simType,
          maxThreads,
          glimpseEnabled,
          maxHandDurationSecs,
          maxCardDraw,
        ),
      };

      if (turn2KillEnabled) {
        const turn2KillRequest = oracleSolveRequest({
          hand: evaluatedHand,
          goFirst,
          materials: activeMaterialCounts,
          deck,
          queue: buildSolveQueue(evaluatedHand, drawn, orderedDeck),
          seed: solveSeed,
          maxThreads,
          glimpseEnabled: simType === "fire_brick" ? false : glimpseEnabled,
          maxHandDurationSecs,
          maxCardDraw,
        });
        const { turn2, turn3 } = await solveTurn2KillPair(turn2KillRequest);
        const detected = turn2.maxDamage >= turn2KillThreshold;
        startTransition(() => {
          if (detected) {
            setTurn2KillResults({
              turn2,
              turn3,
              threshold: turn2KillThreshold,
            });
            setLineHorizonState(2);
            setLineResult(turn2, evaluatedHand);
          } else {
            setLineResult(turn3, evaluatedHand);
          }
        });
        return;
      }

      const result = await apiSolve({
        ...requestBase,
        maxTurns: turns,
      });
      startTransition(() =>
        setLineResult(result as unknown as SolveResult, evaluatedHand),
      );
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
          seed: resolveRunSeed(sampleSeed) as unknown as bigint,
          budget: DEFAULT_BUDGET,
          ...advancedRunFields(
            simType,
            maxThreads,
            glimpseEnabled,
            maxHandDurationSecs,
            maxCardDraw,
          ),
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

    if (ratio.ratioStrategy === "multiDeck") {
      await optimizeMultiDeck(ratio.multiDeckLists);
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
            evalMode: "full",
            baseDeck: ratio.ratioBaseCounts,
            swap: { from: ratio.swapFrom, count, candidates },
            seed: resolveRunSeed(sampleSeed) as unknown as bigint,
            materials: activeMaterialCounts,
            budget: DEFAULT_BUDGET,
            goFirst,
            maxTurns: turns,
            simType,
            rollouts,
            ...advancedRunFields(
              simType,
              maxThreads,
              glimpseEnabled,
              maxHandDurationSecs,
              maxCardDraw,
            ),
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
      ratio.attemptCeiling,
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
          evalMode: ratio.ratioEvalMode,
          baseDeck: {},
          swap: null,
          seed: resolveRunSeed(sampleSeed) as unknown as bigint,
          materials: activeMaterialCounts,
          budget: DEFAULT_BUDGET,
          goFirst,
          maxTurns: turns,
          simType,
          rollouts,
          ...advancedRunFields(
            simType,
            maxThreads,
            glimpseEnabled,
            maxHandDurationSecs,
            maxCardDraw,
          ),
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

  async function optimizeMultiDeck(deckLists: readonly DeckCounts[]) {
    if (optimizeBusy) {
      return;
    }
    if (!workerReachable) {
      setError("The simulation worker is offline. Try again when it is back.");
      return;
    }
    const deckId = activeDeck?.id;
    if (!deckId || !activeDeck) {
      setError("Save or select a deck before running the ratio lab.");
      return;
    }
    if (deckLists.length === 0) {
      setError("Add at least one decklist to the multi-deck test.");
      return;
    }
    if (deckLists.length > MAX_RATIO_DECK_ATTEMPTS) {
      setError(
        `Multi-deck test supports at most ${MAX_RATIO_DECK_ATTEMPTS} lists.`,
      );
      return;
    }
    for (const [index, counts] of deckLists.entries()) {
      const total = Object.values(counts).reduce((sum, copies) => sum + copies, 0);
      if (total !== ratio.deckSize) {
        setError(
          `List ${index + 1} has ${total} cards; expected ${ratio.deckSize}.`,
        );
        return;
      }
    }

    const deckCount = deckLists.length;
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
          strategy: "multiDeck",
          evalMode: "full",
          baseDeck: {},
          swap: null,
          multiDeck: { decks: [...deckLists] },
          seed: resolveRunSeed(sampleSeed) as unknown as bigint,
          materials: activeMaterialCounts,
          budget: DEFAULT_BUDGET,
          goFirst,
          maxTurns: turns,
          simType,
          rollouts,
          ...advancedRunFields(
            simType,
            maxThreads,
            glimpseEnabled,
            maxHandDurationSecs,
            maxCardDraw,
          ),
        },
        initialProgress,
      );
    } catch (optimizeError) {
      setError(
        optimizeError instanceof Error
          ? optimizeError.message
          : "Multi-deck test failed.",
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

  function saveEvaluateJob() {
    if (!evaluateRun || evaluateRun.status !== "running") {
      return;
    }
    void saveWorkerRun(evaluateRun.id);
  }

  function cancelOptimizeJob() {
    if (!optimizeRun || (optimizeRun.status !== "queued" && optimizeRun.status !== "running")) {
      return;
    }
    void cancelWorkerRun(optimizeRun.id);
    setError("Calculation cancelled.");
  }

  function saveOptimizeJob() {
    if (!optimizeRun || optimizeRun.status !== "running") {
      return;
    }
    void saveWorkerRun(optimizeRun.id);
  }

  function importLine(line: ImportedLine) {
    const evaluatedHand = [...line.hand];
    setHand(evaluatedHand);
    setDrawn([]);
    setOrderedDeck([]);
    setSolverMode("hand");
    setGoFirst(line.goFirst);
    setTurns(line.turns);
    setTurn2KillResults(null);
    setLineHorizonState(3);
    if (line.events.length > 0) {
      setLineResult(
        {
          simType,
          maxDamage: line.damage ?? line.events.at(-1)?.damage ?? 0,
          endInfluence: 0,
          events: line.events,
          nodes: 0,
        },
        evaluatedHand,
      );
    } else {
      clearLineResults();
    }
    setError("");
  }

  function sendSampleToHandSolver(sample: SampleHand) {
    const deckEval = evaluateRun?.deckResult;
    const evaluatedHand = [...sample.hand];
    setHand(evaluatedHand);
    setDrawn([]);
    setOrderedDeck([]);
    setSolverMode("hand");
    setSimType(deckEval?.simType ?? simType);
    setLineResult(
      {
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
      },
      evaluatedHand,
    );
    setTurn2KillResults(null);
    setLineHorizonState(3);
    router.push(workbenchHref("line", activeDeckId), { scroll: false });
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
    clearLineResults();
    setError("");
  }

  function drawRandomHandFromDeck() {
    dealShuffledPile(makeSeed());
  }

  function shuffleDeckFromSeed() {
    const pile = cardsFromCounts(listToCounts(parseDecklist(deckText)));
    if (pile.length < OPENING_HAND_SIZE) {
      setError(
        `Need at least ${OPENING_HAND_SIZE} recognized cards in the selected deck to shuffle.`,
      );
      return;
    }
    const seed = makeSeed();
    setSolveSeed(seed);
    setOrderedDeck(shuffleDeck(pile, seed));
    setDrawn([]);
    clearLineResults();
    setError("");
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
    clearLineResults();
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
    clearLineResults();
    setError("");
  }

  function applySolveSeed(raw: number | null) {
    if (raw == null) {
      return;
    }
    const seed = normalizeSeed(raw);
    setSolveSeed(seed);
    if (orderedDeck.length > 0) {
      const pile = cardsFromCounts(listToCounts(parseDecklist(deckText)));
      if (pile.length >= OPENING_HAND_SIZE) {
        setOrderedDeck(shuffleDeck(pile, seed));
        setDrawn([]);
      }
    }
    clearLineResults();
    setError("");
  }

  function applySampleSeed(raw: number | null) {
    setSampleSeed(raw == null ? null : normalizeSeed(raw));
  }

  function onSolverModeChange(mode: SolverMode) {
    setSolverMode(mode);
    clearLineResults();
  }

  function onSimTypeChange(value: SimType) {
    setSimType(value);
    if (value === "fire_brick") {
      setGlimpseEnabled(false);
    } else if (simType === "fire_brick") {
      setGlimpseEnabled(true);
    }
    clearLineResults();
  }

  return {
    hand,
    drawn,
    orderedDeck,
    solveSeed,
    sampleSeed,
    solverMode,
    selectedCard,
    goFirst,
    turns,
    turn2KillEnabled,
    turn2KillThreshold,
    simType,
    rollouts,
    maxThreads,
    glimpseEnabled,
    maxHandDurationSecs,
    maxCardDraw,
    cpuCount,
    lineResult,
    lineHand,
    turn2KillResults,
    lineHorizon,
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
    setTurn2KillEnabled,
    setTurn2KillThreshold,
    setLineHorizon,
    setSimType,
    setRollouts,
    setMaxThreads,
    setGlimpseEnabled,
    setMaxHandDurationSecs,
    setMaxCardDraw,
    setLineResult,
    setSamples,
    setError,
    solveHand,
    evaluateCurrentDeck,
    optimizeCurrentBounds,
    optimizeMultiDeck,
    cancelHandSolve,
    cancelEvaluateJob,
    saveEvaluateJob,
    cancelOptimizeJob,
    saveOptimizeJob,
    sendSampleToHandSolver,
    importLine,
    drawRandomHandFromDeck,
    drawCardFromDeck,
    shuffleDeckFromSeed,
    applySolveSeed,
    applySampleSeed,
    onDrawnChange,
    onSolverModeChange,
    onSimTypeChange,
  };
}
