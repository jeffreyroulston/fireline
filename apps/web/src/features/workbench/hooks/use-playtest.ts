"use client";

import { useCallback, useRef, useState } from "react";
import type {
  LineEvent,
  PlaytestAction,
  PlaytestActionOption,
  PlaytestStateView,
} from "@ga-fire/contracts";
import type { CardId, DeckCounts, SolveResult } from "@/lib/engine";
import {
  playtestApply,
  playtestInit,
  playtestLegalActions,
  solve as apiSolve,
} from "@/lib/api/client";
import { useRunTracker } from "@/lib/runs/run-tracker";
import {
  type DiscardPrompt,
  discardOptionalFor,
  discardHandFor,
  discardStepDrawnIndex,
  discardStepHand,
  discardStepOptional,
  discardStepsFor,
  drawnDiscardIndexFor,
  excludedIndicesForDiscard,
  needsDiscardPicker,
  withDiscardChoice,
  withDiscardChoices,
} from "../panels/hand/discard-picker";
import {
  type ReservePrompt,
  resolveReserveRequirement,
  hasReserveSelection,
  inferReserveRequirement,
  withReservedHandIndices,
} from "../panels/hand/reserve-picker";
import type { LineHorizon, Turn2KillResults } from "../types";
import {
  buildSolveQueue,
  oracleSolveRequest,
  solveTurn2KillPair,
} from "../lib/turn-2-kill-solve";

const PLAYTEST_COMPARE_WORK_ID = "playtest-compare";

type PlaytestPhase = "setup" | "playing" | "done" | "compared";

type HistoryEntry = Readonly<{
  board: PlaytestStateView;
  events: LineEvent[];
}>;

type PendingPlaytestStep = Readonly<{
  action: PlaytestAction;
  option: PlaytestActionOption;
  reservedIndices: number[];
}>;

type UsePlaytestOptions = Readonly<{
  hand: CardId[];
  drawn: CardId[];
  orderedDeck: CardId[];
  goFirst: boolean;
  turns: number;
  turn2KillEnabled: boolean;
  turn2KillThreshold: number;
  seed: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  materials: DeckCounts;
  deck: DeckCounts | undefined;
}>;

export function usePlaytest({
  hand,
  drawn,
  orderedDeck,
  goFirst,
  turns,
  turn2KillEnabled,
  turn2KillThreshold,
  seed,
  maxThreads,
  glimpseEnabled,
  maxHandDurationSecs,
  maxCardDraw,
  materials,
  deck,
}: UsePlaytestOptions) {
  const { beginDirectWork, endDirectWork } = useRunTracker();
  const compareAbortRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<PlaytestPhase>("setup");
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [board, setBoard] = useState<PlaytestStateView | null>(null);
  const [events, setEvents] = useState<LineEvent[]>([]);
  const [legalActions, setLegalActions] = useState<
    PlaytestActionOption[]
  >([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [optimalResult, setOptimalResult] = useState<SolveResult | null>(null);
  const [turn2KillResults, setTurn2KillResults] =
    useState<Turn2KillResults | null>(null);
  const [lineHorizon, setLineHorizonState] = useState<LineHorizon>(3);
  const [reservePrompt, setReservePrompt] = useState<ReservePrompt | null>(
    null,
  );
  const [selectedReserveIndices, setSelectedReserveIndices] = useState<
    number[]
  >([]);
  const [discardPrompt, setDiscardPrompt] = useState<DiscardPrompt | null>(
    null,
  );
  const [pendingDiscardChoices, setPendingDiscardChoices] = useState<
    Array<number | null>
  >([]);
  const [pendingStep, setPendingStep] = useState<PendingPlaytestStep | null>(
    null,
  );

  const playtestMaxTurns = turn2KillEnabled ? 3 : turns;

  const setLineHorizon = useCallback((horizon: LineHorizon) => {
    setLineHorizonState(horizon);
    setTurn2KillResults((current) => {
      if (current) {
        setOptimalResult(horizon === 2 ? current.turn2 : current.turn3);
      }
      return current;
    });
  }, []);

  const clearCompareResults = useCallback(() => {
    setOptimalResult(null);
    setTurn2KillResults(null);
    setLineHorizonState(3);
  }, []);

  const buildQueue = useCallback(
    () => buildSolveQueue(hand, drawn, orderedDeck),
    [drawn, hand, orderedDeck],
  );

  const refreshLegalActions = useCallback(async (engine: PlaytestStateView["engine"]) => {
    const result = await playtestLegalActions({ state: engine });
    setLegalActions(result.actions);
  }, []);

  const reset = useCallback(() => {
    compareAbortRef.current?.abort();
    compareAbortRef.current = null;
    endDirectWork(PLAYTEST_COMPARE_WORK_ID);
    setPhase("setup");
    setBoard(null);
    setEvents([]);
    setLegalActions([]);
    setHistory([]);
    clearCompareResults();
    setReservePrompt(null);
    setSelectedReserveIndices([]);
    setDiscardPrompt(null);
    setPendingDiscardChoices([]);
    setPendingStep(null);
    setComparing(false);
    setError("");
  }, [clearCompareResults, endDirectWork]);

  const start = useCallback(async () => {
    if (hand.length < 2) {
      setError("Add at least two cards before starting playtest.");
      return;
    }
    if (orderedDeck.length === 0) {
      setError("Shuffle the deck before playtest — draws come from the seeded pile.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await playtestInit({
        hand,
        goFirst,
        maxTurns: playtestMaxTurns,
        materials,
        queue: buildQueue(),
      });
      setBoard(result.state);
      setEvents(result.events);
      setHistory([]);
      clearCompareResults();
      setPhase("playing");
      await refreshLegalActions(result.state.engine);
    } catch (startError) {
      setError(
        startError instanceof Error ? startError.message : "Playtest failed to start.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    buildQueue,
    clearCompareResults,
    goFirst,
    hand,
    materials,
    orderedDeck.length,
    playtestMaxTurns,
    refreshLegalActions,
  ]);

  const applyAction = useCallback(
    async (action: PlaytestAction) => {
      if (!board || busy) {
        return;
      }
      const inferred = inferReserveRequirement(action, board);
      if (
        inferred &&
        inferred.reserveCount > 0 &&
        !hasReserveSelection(action)
      ) {
        setError("Select cards to reserve before playing this action.");
        return;
      }
      setBusy(true);
      setError("");
      setReservePrompt(null);
      setSelectedReserveIndices([]);
      setDiscardPrompt(null);
      setPendingStep(null);
      const snapshot: HistoryEntry = { board, events: [...events] };
      try {
        const result = await playtestApply({
          state: board.engine,
          action,
        });
        setHistory((current) => [...current, snapshot]);
        setBoard(result.state);
        setEvents((current) => [...current, ...result.events]);
        clearCompareResults();
        if (result.state.terminal) {
          setPhase("done");
          setLegalActions([]);
        } else {
          setPhase("playing");
          await refreshLegalActions(result.state.engine);
        }
      } catch (applyError) {
        setError(
          applyError instanceof Error ? applyError.message : "Could not apply that action.",
        );
      } finally {
        setBusy(false);
      }
    },
    [board, busy, clearCompareResults, events, refreshLegalActions],
  );

  const openDiscardOrApply = useCallback(
    (step: PendingPlaytestStep, stepIndex = 0, priorChoices: Array<number | null> = []) => {
      if (!board) {
        return;
      }
      const steps = discardStepsFor(step.option);
      if (steps.length > 0) {
        const current = steps[stepIndex];
        if (!current) {
          void applyAction(withDiscardChoices(step.action, priorChoices));
          return;
        }
        const hand = discardStepHand(current);
        setPendingStep(step);
        setPendingDiscardChoices(priorChoices);
        setDiscardPrompt({
          label: current.label,
          action: step.action,
          hand,
          excludedIndices: excludedIndicesForDiscard(
            hand,
            step.option.playedCard,
            step.reservedIndices,
          ),
          optional: discardStepOptional(current),
          drawnIndex: discardStepDrawnIndex(current),
          stepIndex,
          stepCount: steps.length,
        });
        return;
      }
      const discardHand = discardHandFor(step.option);
      if (!needsDiscardPicker(step.option)) {
        void applyAction(step.action);
        return;
      }
      setPendingDiscardChoices([]);
      setPendingStep(step);
      setDiscardPrompt({
        label: step.option.label,
        action: step.action,
        hand: discardHand,
        excludedIndices: excludedIndicesForDiscard(
          discardHand,
          step.option.playedCard,
          step.reservedIndices,
        ),
        optional: discardOptionalFor(step.option),
        drawnIndex: drawnDiscardIndexFor(step.option),
        stepIndex: 0,
        stepCount: 1,
      });
    },
    [applyAction, board],
  );

  const advanceDiscardOrApply = useCallback(
    (step: PendingPlaytestStep, choices: Array<number | null>) => {
      const steps = discardStepsFor(step.option);
      if (steps.length > 0 && choices.length < steps.length) {
        openDiscardOrApply(step, choices.length, choices);
        return;
      }
      setPendingDiscardChoices([]);
      setDiscardPrompt(null);
      void applyAction(
        steps.length > 0
          ? withDiscardChoices(step.action, choices)
          : withDiscardChoice(
              step.action,
              choices[0] === null
                ? { skip: true }
                : { handIndex: choices[0] ?? 0 },
            ),
      );
    },
    [applyAction, openDiscardOrApply],
  );

  const requestAction = useCallback(
    (option: PlaytestActionOption) => {
      if (!board || busy) {
        return;
      }
      const step: PendingPlaytestStep = {
        action: option.action,
        option,
        reservedIndices: [],
      };
      const requirement = resolveReserveRequirement(
        option.action,
        option,
        board,
      );
      if (requirement.reserveCount > 0) {
        setPendingStep(step);
        setReservePrompt({
          label: option.label,
          action: option.action,
          reserveCount: requirement.reserveCount,
          fireOnly: requirement.fireOnly,
          playedCard: requirement.playedCard,
          hand: board.hand,
        });
        setSelectedReserveIndices([]);
        setDiscardPrompt(null);
        return;
      }
      setPendingStep(step);
      openDiscardOrApply(step);
    },
    [board, busy, openDiscardOrApply],
  );

  const toggleReserveIndex = useCallback((handIndex: number) => {
    setSelectedReserveIndices((current) =>
      current.includes(handIndex)
        ? current.filter((index) => index !== handIndex)
        : [...current, handIndex],
    );
  }, []);

  const confirmReserve = useCallback(() => {
    if (!reservePrompt || !pendingStep || selectedReserveIndices.length !== reservePrompt.reserveCount) {
      return;
    }
    const action = withReservedHandIndices(
      reservePrompt.action,
      selectedReserveIndices,
    );
    setReservePrompt(null);
    setSelectedReserveIndices([]);
    openDiscardOrApply({
      ...pendingStep,
      action,
      reservedIndices: selectedReserveIndices,
    });
  }, [openDiscardOrApply, pendingStep, reservePrompt, selectedReserveIndices]);

  const cancelReserve = useCallback(() => {
    setReservePrompt(null);
    setSelectedReserveIndices([]);
    setPendingStep(null);
  }, []);

  const confirmDiscard = useCallback(
    (handIndex: number) => {
      if (!discardPrompt || !pendingStep) {
        return;
      }
      advanceDiscardOrApply(pendingStep, [...pendingDiscardChoices, handIndex]);
    },
    [advanceDiscardOrApply, discardPrompt, pendingDiscardChoices, pendingStep],
  );

  const skipDiscard = useCallback(() => {
    if (!discardPrompt || !pendingStep) {
      return;
    }
    advanceDiscardOrApply(pendingStep, [...pendingDiscardChoices, null]);
  }, [advanceDiscardOrApply, discardPrompt, pendingDiscardChoices, pendingStep]);

  const cancelDiscard = useCallback(() => {
    setDiscardPrompt(null);
    setPendingDiscardChoices([]);
    setPendingStep(null);
  }, []);

  const undo = useCallback(async () => {
    if (history.length === 0 || busy) {
      return;
    }
    const previous = history[history.length - 1];
    setHistory((current) => current.slice(0, -1));
    setBoard(previous.board);
    setEvents(previous.events);
    clearCompareResults();
    setPhase(previous.board.terminal ? "done" : "playing");
    setError("");
    setReservePrompt(null);
    setSelectedReserveIndices([]);
    setDiscardPrompt(null);
    setPendingDiscardChoices([]);
    setPendingStep(null);
    setBusy(true);
    try {
      if (!previous.board.terminal) {
        await refreshLegalActions(previous.board.engine);
      } else {
        setLegalActions([]);
      }
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Undo failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, clearCompareResults, history, refreshLegalActions]);

  const cancelCompare = useCallback(() => {
    compareAbortRef.current?.abort();
  }, []);

  const finishAndCompare = useCallback(async () => {
    if (events.length === 0) {
      setError("Play at least one step before comparing.");
      return;
    }
    const abort = new AbortController();
    compareAbortRef.current = abort;
    beginDirectWork({
      id: PLAYTEST_COMPARE_WORK_ID,
      label: "Playtest compare",
      cancel: () => abort.abort(),
    });
    setBusy(true);
    setComparing(true);
    setError("");
    try {
      const queue = buildQueue();
      const requestBase = oracleSolveRequest({
        hand,
        goFirst,
        materials,
        deck,
        queue,
        seed,
        maxThreads,
        glimpseEnabled,
        maxHandDurationSecs,
        maxCardDraw,
      });

      if (turn2KillEnabled) {
        const { turn2, turn3 } = await solveTurn2KillPair(requestBase, {
          signal: abort.signal,
        });
        if (turn2.maxDamage >= turn2KillThreshold) {
          setTurn2KillResults({
            turn2,
            turn3,
            threshold: turn2KillThreshold,
          });
          setLineHorizonState(2);
          setOptimalResult(turn2);
        } else {
          setTurn2KillResults(null);
          setLineHorizonState(3);
          setOptimalResult(turn3);
        }
      } else {
        const result = await apiSolve(
          { ...requestBase, maxTurns: turns },
          { signal: abort.signal },
        );
        setTurn2KillResults(null);
        setLineHorizonState(3);
        setOptimalResult(result as unknown as SolveResult);
      }
      setPhase("compared");
    } catch (compareError) {
      if (abort.signal.aborted) {
        return;
      }
      setError(
        compareError instanceof Error
          ? compareError.message
          : "Could not run optimal comparison.",
      );
    } finally {
      compareAbortRef.current = null;
      endDirectWork(PLAYTEST_COMPARE_WORK_ID);
      setBusy(false);
      setComparing(false);
    }
  }, [
    beginDirectWork,
    buildQueue,
    deck,
    endDirectWork,
    events.length,
    glimpseEnabled,
    goFirst,
    hand,
    materials,
    maxCardDraw,
    maxHandDurationSecs,
    maxThreads,
    seed,
    turn2KillEnabled,
    turn2KillThreshold,
    turns,
  ]);

  return {
    phase,
    busy,
    comparing,
    error,
    board,
    events,
    legalActions,
    canUndo: history.length > 0,
    optimalResult,
    turn2KillResults,
    lineHorizon,
    setLineHorizon,
    reservePrompt,
    selectedReserveIndices,
    discardPrompt,
    start,
    applyAction,
    requestAction,
    toggleReserveIndex,
    confirmReserve,
    cancelReserve,
    confirmDiscard,
    skipDiscard,
    cancelDiscard,
    undo,
    finishAndCompare,
    cancelCompare,
    reset,
    setError,
  };
}
