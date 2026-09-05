"use client";

import { useCallback, useRef, useState } from "react";
import {
  canUndoSession,
  initialSessionState,
  isSessionBusy,
  sessionReducer,
  type SessionEvent,
  type SessionEffect,
  type SessionState,
} from "@ga-fire/game";
import {
  playtestApply,
  playtestInit,
  playtestLegalActions,
} from "@/lib/api/playtest";

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

export function useGameSession() {
  const [state, setState] = useState<SessionState>(initialSessionState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback((event: SessionEvent) => {
    const transition = sessionReducer(stateRef.current, event);
    setState(transition.state);
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
  }, []);

  return {
    state,
    dispatch,
    busy: isSessionBusy(state),
    canUndo: canUndoSession(state),
  };
}

export type GameSession = ReturnType<typeof useGameSession>;
