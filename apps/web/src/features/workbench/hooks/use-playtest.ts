"use client";

import { useCallback, useState } from "react";
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
import { DEFAULT_BUDGET } from "@/lib/budget";
import { subtractCards } from "../utils";
import {
  type DiscardPrompt,
  discardOptionalFor,
  discardHandFor,
  drawnDiscardIndexFor,
  excludedIndicesForDiscard,
  needsDiscardPicker,
  withDiscardChoice,
} from "../panels/hand/discard-picker";
import {
  type ReservePrompt,
  resolveReserveRequirement,
  hasReserveSelection,
  inferReserveRequirement,
  withReservedHandIndices,
} from "../panels/hand/reserve-picker";

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
  materials: DeckCounts;
  deck: DeckCounts | undefined;
}>;

export function usePlaytest({
  hand,
  drawn,
  orderedDeck,
  goFirst,
  turns,
  materials,
  deck,
}: UsePlaytestOptions) {
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
  const [reservePrompt, setReservePrompt] = useState<ReservePrompt | null>(
    null,
  );
  const [selectedReserveIndices, setSelectedReserveIndices] = useState<
    number[]
  >([]);
  const [discardPrompt, setDiscardPrompt] = useState<DiscardPrompt | null>(
    null,
  );
  const [pendingStep, setPendingStep] = useState<PendingPlaytestStep | null>(
    null,
  );

  const buildQueue = useCallback(() => {
    if (orderedDeck.length === 0) {
      return drawn;
    }
    return [...drawn, ...subtractCards(orderedDeck, [...hand, ...drawn])];
  }, [drawn, hand, orderedDeck]);

  const refreshLegalActions = useCallback(async (engine: PlaytestStateView["engine"]) => {
    const result = await playtestLegalActions({ state: engine });
    setLegalActions(result.actions);
  }, []);

  const reset = useCallback(() => {
    setPhase("setup");
    setBoard(null);
    setEvents([]);
    setLegalActions([]);
    setHistory([]);
    setOptimalResult(null);
    setReservePrompt(null);
    setSelectedReserveIndices([]);
    setDiscardPrompt(null);
    setPendingStep(null);
    setComparing(false);
    setError("");
  }, []);

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
        maxTurns: turns,
        materials,
        queue: buildQueue(),
      });
      setBoard(result.state);
      setEvents(result.events);
      setHistory([]);
      setOptimalResult(null);
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
    goFirst,
    hand,
    materials,
    orderedDeck.length,
    refreshLegalActions,
    turns,
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
        setOptimalResult(null);
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
    [board, busy, events, refreshLegalActions],
  );

  const openDiscardOrApply = useCallback(
    (step: PendingPlaytestStep) => {
      if (!board) {
        return;
      }
      const discardHand = discardHandFor(step.option);
      if (!needsDiscardPicker(step.option)) {
        void applyAction(step.action);
        return;
      }
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
      });
    },
    [applyAction, board],
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
      if (!discardPrompt) {
        return;
      }
      void applyAction(
        withDiscardChoice(discardPrompt.action, { handIndex }),
      );
    },
    [applyAction, discardPrompt],
  );

  const skipDiscard = useCallback(() => {
    if (!discardPrompt) {
      return;
    }
    void applyAction(withDiscardChoice(discardPrompt.action, { skip: true }));
  }, [applyAction, discardPrompt]);

  const cancelDiscard = useCallback(() => {
    setDiscardPrompt(null);
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
    setOptimalResult(null);
    setPhase(previous.board.terminal ? "done" : "playing");
    setError("");
    setReservePrompt(null);
    setSelectedReserveIndices([]);
    setDiscardPrompt(null);
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
  }, [busy, history, refreshLegalActions]);

  const finishAndCompare = useCallback(async () => {
    if (events.length === 0) {
      setError("Play at least one step before comparing.");
      return;
    }
    setBusy(true);
    setComparing(true);
    setError("");
    try {
      const result = await apiSolve({
        hand: [...hand],
        goFirst,
        maxTurns: turns,
        simType: "oracle_only",
        rollouts: 1,
        seed: 42 as unknown as bigint,
        materials,
        deck: deck ?? {},
        queue: buildQueue(),
        budget: DEFAULT_BUDGET,
        maxThreads: null,
        glimpseEnabled: true,
        maxHandDurationSecs: null,
        maxCardDraw: null,
      });
      setOptimalResult(result as unknown as SolveResult);
      setPhase("compared");
    } catch (compareError) {
      setError(
        compareError instanceof Error
          ? compareError.message
          : "Could not run optimal comparison.",
      );
    } finally {
      setBusy(false);
      setComparing(false);
    }
  }, [buildQueue, deck, events.length, goFirst, hand, materials, turns]);

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
    reset,
    setError,
  };
}
