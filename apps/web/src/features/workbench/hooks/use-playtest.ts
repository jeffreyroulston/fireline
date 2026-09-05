"use client";

import { useCallback, useRef, useState } from "react";
import type { PlaytestAction, PlaytestActionOption } from "@ga-fire/contracts";
import {
  canUndoSession,
  initialSessionState,
  isSessionBusy,
  sessionReducer,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from "@ga-fire/game";
import type { CardId, DeckCounts, SolveResult } from "@/lib/engine";
import {
  playtestApply,
  playtestInit,
  playtestLegalActions,
  solve as apiSolve,
} from "@/lib/api/client";
import { useRunTracker } from "@/lib/runs/run-tracker";
import type { DiscardPrompt } from "../panels/hand/discard-picker";
import type { ReservePrompt } from "../panels/hand/reserve-picker";
import type { LineHorizon, Turn2KillResults } from "../types";
import {
  buildSolveQueue,
  oracleSolveRequest,
  solveTurn2KillPair,
} from "../lib/turn-2-kill-solve";

const PLAYTEST_COMPARE_WORK_ID = "playtest-compare";

type PlaytestPhase = "setup" | "playing" | "done" | "compared";

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
  exhaustiveReservation: boolean;
  materials: DeckCounts;
  deck: DeckCounts | undefined;
}>;

async function runSessionEffect(effect: SessionEffect) {
  switch (effect.kind) {
    case "init":
      return {
        event: {
          type: "initSucceeded" as const,
          result: await playtestInit(effect.request),
        },
      };
    case "legalActions":
      return {
        event: {
          type: "legalActionsSucceeded" as const,
          result: await playtestLegalActions(effect.request),
        },
      };
    case "apply":
      return {
        event: {
          type: "applySucceeded" as const,
          result: await playtestApply(effect.request),
        },
      };
  }
}

function toReservePrompt(
  state: SessionState,
): { prompt: ReservePrompt; selected: number[] } | null {
  if (state.prompt?.kind !== "reserve" || !state.pending) {
    return null;
  }
  return {
    prompt: {
      label: state.prompt.label,
      action: state.pending.action,
      reserveCount: state.prompt.reserveCount,
      fireOnly: state.prompt.fireOnly,
      playedCard: state.prompt.playedCard,
      hand: [...state.prompt.hand],
    },
    selected: [...state.prompt.selected],
  };
}

function toDiscardPrompt(state: SessionState): DiscardPrompt | null {
  if (state.prompt?.kind !== "discard" || !state.pending) {
    return null;
  }
  return {
    label: state.prompt.label,
    action: state.pending.action,
    hand: [...state.prompt.hand],
    excludedIndices: [...state.prompt.excludedIndices],
    optional: state.prompt.optional,
    drawnIndex: state.prompt.drawnIndex,
    stepIndex: state.prompt.stepIndex,
    stepCount: state.prompt.stepCount,
  };
}

function findLegalOption(
  legalActions: readonly PlaytestActionOption[],
  action: PlaytestAction,
): PlaytestActionOption | null {
  const exact = legalActions.find((option) => option.action === action);
  if (exact) {
    return exact;
  }
  const serialized = JSON.stringify(action);
  return (
    legalActions.find((option) => JSON.stringify(option.action) === serialized) ??
    null
  );
}

/**
 * Workbench playtest adapter: shared `@ga-fire/game` session for interactive
 * steps; oracle compare stays a separate workbench effect via `/solve`.
 */
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
  exhaustiveReservation,
  materials,
  deck,
}: UsePlaytestOptions) {
  const { beginDirectWork, endDirectWork } = useRunTracker();
  const compareAbortRef = useRef<AbortController | null>(null);
  const [session, setSession] = useState<SessionState>(initialSessionState);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [compared, setCompared] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [optimalResult, setOptimalResult] = useState<SolveResult | null>(null);
  const [turn2KillResults, setTurn2KillResults] =
    useState<Turn2KillResults | null>(null);
  const [lineHorizon, setLineHorizonState] = useState<LineHorizon>(3);

  const playtestMaxTurns = turn2KillEnabled ? 3 : turns;

  const clearCompareResults = useCallback(() => {
    setCompared(false);
    setOptimalResult(null);
    setTurn2KillResults(null);
    setLineHorizonState(3);
  }, []);

  const setLineHorizon = useCallback((horizon: LineHorizon) => {
    setLineHorizonState(horizon);
    setTurn2KillResults((current) => {
      if (current) {
        setOptimalResult(horizon === 2 ? current.turn2 : current.turn3);
      }
      return current;
    });
  }, []);

  const dispatch = useCallback((event: SessionEvent) => {
    if (
      event.type === "start" ||
      event.type === "applySucceeded" ||
      event.type === "undo" ||
      event.type === "reset"
    ) {
      clearCompareResults();
    }
    const transition = sessionReducer(sessionRef.current, event);
    setSession(transition.state);
    if (transition.effect) {
      void runSessionEffect(transition.effect)
        .then(({ event: followUp }) => {
          dispatch(followUp);
        })
        .catch((error: unknown) => {
          dispatch({
            type: "requestFailed",
            message:
              error instanceof Error ? error.message : "Request failed.",
          });
        });
    }
  }, [clearCompareResults]);

  const buildQueue = useCallback(
    () => buildSolveQueue(hand, drawn, orderedDeck),
    [drawn, hand, orderedDeck],
  );

  const reset = useCallback(() => {
    compareAbortRef.current?.abort();
    compareAbortRef.current = null;
    endDirectWork(PLAYTEST_COMPARE_WORK_ID);
    setComparing(false);
    clearCompareResults();
    dispatch({ type: "reset" });
  }, [clearCompareResults, dispatch, endDirectWork]);

  const start = useCallback(() => {
    if (hand.length < 2) {
      dispatch({
        type: "setError",
        message: "Add at least two cards before starting playtest.",
      });
      return;
    }
    if (orderedDeck.length === 0) {
      dispatch({
        type: "setError",
        message:
          "Shuffle the deck before playtest — draws come from the seeded pile.",
      });
      return;
    }
    dispatch({
      type: "start",
      request: {
        hand,
        goFirst,
        maxTurns: playtestMaxTurns,
        materials,
        queue: buildQueue(),
      },
    });
  }, [
    buildQueue,
    dispatch,
    goFirst,
    hand,
    materials,
    orderedDeck.length,
    playtestMaxTurns,
  ]);

  const requestAction = useCallback(
    (option: PlaytestActionOption) => {
      dispatch({ type: "selectAction", option });
    },
    [dispatch],
  );

  const applyAction = useCallback(
    (action: PlaytestAction) => {
      const option = findLegalOption(sessionRef.current.legalActions, action);
      if (!option) {
        dispatch({
          type: "setError",
          message: "That action is no longer legal.",
        });
        return;
      }
      dispatch({ type: "selectAction", option });
    },
    [dispatch],
  );

  const cancelCompare = useCallback(() => {
    compareAbortRef.current?.abort();
  }, []);

  const finishAndCompare = useCallback(async () => {
    if (sessionRef.current.events.length === 0) {
      dispatch({
        type: "setError",
        message: "Play at least one step before comparing.",
      });
      return;
    }
    const abort = new AbortController();
    compareAbortRef.current = abort;
    beginDirectWork({
      id: PLAYTEST_COMPARE_WORK_ID,
      label: "Playtest compare",
      cancel: () => abort.abort(),
    });
    setComparing(true);
    dispatch({ type: "setError", message: null });
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
        exhaustiveReservation,
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
      setCompared(true);
    } catch (compareError) {
      if (abort.signal.aborted) {
        return;
      }
      dispatch({
        type: "setError",
        message:
          compareError instanceof Error
            ? compareError.message
            : "Could not run optimal comparison.",
      });
    } finally {
      compareAbortRef.current = null;
      endDirectWork(PLAYTEST_COMPARE_WORK_ID);
      setComparing(false);
    }
  }, [
    beginDirectWork,
    buildQueue,
    deck,
    dispatch,
    endDirectWork,
    exhaustiveReservation,
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

  const reserve = toReservePrompt(session);
  const discardPrompt = toDiscardPrompt(session);
  const sessionBusy = isSessionBusy(session);
  const busy = sessionBusy || comparing;

  let phase: PlaytestPhase = session.status;
  if (compared) {
    phase = "compared";
  }

  return {
    phase,
    busy,
    comparing,
    error: session.error ?? "",
    board: session.board,
    events: [...session.events],
    legalActions: [...session.legalActions],
    canUndo: canUndoSession(session),
    optimalResult,
    turn2KillResults,
    lineHorizon,
    setLineHorizon,
    reservePrompt: reserve?.prompt ?? null,
    selectedReserveIndices: reserve?.selected ?? [],
    discardPrompt,
    start,
    applyAction,
    requestAction,
    toggleReserveIndex: (handIndex: number) =>
      dispatch({ type: "toggleReserve", handIndex }),
    confirmReserve: () => dispatch({ type: "confirmReserve" }),
    cancelReserve: () => dispatch({ type: "cancelPrompt" }),
    confirmDiscard: (handIndex: number) =>
      dispatch({ type: "chooseDiscard", handIndex }),
    skipDiscard: () => dispatch({ type: "skipDiscard" }),
    cancelDiscard: () => dispatch({ type: "cancelPrompt" }),
    undo: () => dispatch({ type: "undo" }),
    finishAndCompare,
    cancelCompare,
    reset,
    setError: (message: string) =>
      dispatch({ type: "setError", message: message || null }),
  };
}
