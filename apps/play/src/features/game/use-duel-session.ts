"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaytestActionOption, PlaytestInitRequest } from "@ga-fire/contracts";
import {
  initialSessionState,
  isSessionBusy,
  sessionReducer,
  type SessionEvent,
  type SessionState,
} from "@ga-fire/game";

import {
  createDuel,
  duelAction,
  joinDuel,
  readyDuel,
  rejoinDuel,
  startDuel,
  subscribeDuel,
  type DuelSnapshot,
  type SeatId,
} from "@/lib/api/duels";
import {
  clearDuelRejoinCookie,
  readDuelRejoinCookie,
  writeDuelRejoinCookie,
} from "./duel-rejoin-cookie";

export type DuelPhase =
  | "idle"
  | "setup"
  | "waiting"
  | "playing"
  | "done";

function sessionFromSeat(
  snapshot: DuelSnapshot,
  seat: SeatId,
  previous: SessionState,
): SessionState {
  const mine = snapshot.seats[seat];
  const isController = snapshot.controller === seat;
  const status =
    snapshot.status === "done" ? "done" : "playing";

  // Keep an open payment prompt only while the local board is unchanged and
  // we still control the turn (SSE after Pass / opponent updates clears it).
  const keepPrompt =
    previous.prompt != null &&
    previous.board != null &&
    mine.board != null &&
    previous.board === mine.board &&
    isController &&
    snapshot.status === "playing";

  return {
    ...initialSessionState,
    status,
    board: mine.board,
    events: mine.events,
    legalActions: isController && snapshot.status === "playing" ? mine.legalActions : [],
    prompt: keepPrompt ? previous.prompt : null,
    pending: keepPrompt ? previous.pending : null,
    error: null,
    inFlight: null,
    history: [],
  };
}

function rememberSeat(code: string, clientId: string, seat: SeatId) {
  writeDuelRejoinCookie({ code, clientId, seat });
}

export function useDuelSession() {
  const [phase, setPhase] = useState<DuelPhase>("idle");
  const [code, setCode] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [seat, setSeat] = useState<SeatId | null>(null);
  const [snapshot, setSnapshot] = useState<DuelSnapshot | null>(null);
  const [session, setSession] = useState<SessionState>(initialSessionState);
  const [error, setError] = useState<string | null>(null);
  const [netBusy, setNetBusy] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const seatRef = useRef(seat);
  seatRef.current = seat;
  const codeRef = useRef(code);
  codeRef.current = code;
  const clientRef = useRef(clientId);
  clientRef.current = clientId;
  const restoreAttempted = useRef(false);

  const applySnapshot = useCallback((next: DuelSnapshot) => {
    setSnapshot(next);
    const localSeat = seatRef.current;
    if (!localSeat) return;
    if (next.status === "lobby") {
      setPhase(next.seats[localSeat].ready ? "waiting" : "setup");
      return;
    }
    if (next.status === "playing" || next.status === "done") {
      setPhase(next.status === "done" ? "done" : "playing");
      setSession((prev) => sessionFromSeat(next, localSeat, prev));
    }
  }, []);

  const enterRoom = useCallback(
    (joined: {
      code: string;
      clientId: string;
      seat: SeatId;
      snapshot: DuelSnapshot;
    }) => {
      rememberSeat(joined.code, joined.clientId, joined.seat);
      setCode(joined.code);
      setClientId(joined.clientId);
      setSeat(joined.seat);
      seatRef.current = joined.seat;
      setSnapshot(joined.snapshot);
      applySnapshot(joined.snapshot);
    },
    [applySnapshot],
  );

  // Rejoin from cookie after refresh
  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;
    const saved = readDuelRejoinCookie();
    if (!saved) {
      setBootstrapped(true);
      return;
    }
    let cancelled = false;
    setRestoring(true);
    setNetBusy(true);
    void rejoinDuel(saved.code, saved.clientId)
      .then((joined) => {
        if (cancelled) return;
        enterRoom(joined);
      })
      .catch(() => {
        if (cancelled) return;
        clearDuelRejoinCookie();
        setError(null);
      })
      .finally(() => {
        if (!cancelled) {
          setRestoring(false);
          setNetBusy(false);
          setBootstrapped(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enterRoom]);

  // SSE while in a room
  useEffect(() => {
    if (!code || !clientId) return;
    const source = subscribeDuel(
      code,
      clientId,
      (next) => {
        applySnapshot(next);
      },
      (message) => {
        // Stale cookie / gone room — drop membership so lobby works again.
        if (message.includes("not found") || message.includes("Not a member")) {
          clearDuelRejoinCookie();
        }
        setError(message);
      },
    );
    return () => {
      source.close();
    };
  }, [code, clientId, applySnapshot]);

  const beginCreate = useCallback(async () => {
    setNetBusy(true);
    setError(null);
    try {
      const joined = await createDuel();
      enterRoom(joined);
      if (joined.snapshot.status === "lobby") {
        setPhase(joined.snapshot.seats[joined.seat].ready ? "waiting" : "setup");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create duel.");
    } finally {
      setNetBusy(false);
    }
  }, [enterRoom]);

  const beginJoin = useCallback(async (joinCode: string) => {
    setNetBusy(true);
    setError(null);
    try {
      const joined = await joinDuel(joinCode);
      enterRoom(joined);
      if (joined.snapshot.status === "lobby") {
        setPhase(joined.snapshot.seats[joined.seat].ready ? "waiting" : "setup");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join duel.");
    } finally {
      setNetBusy(false);
    }
  }, [enterRoom]);

  const submitReady = useCallback(async (request: PlaytestInitRequest) => {
    const room = codeRef.current;
    const id = clientRef.current;
    if (!room || !id) return;
    setNetBusy(true);
    setError(null);
    try {
      const next = await readyDuel(room, id, request);
      applySnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ready.");
    } finally {
      setNetBusy(false);
    }
  }, [applySnapshot]);

  const submitStart = useCallback(async () => {
    const room = codeRef.current;
    const id = clientRef.current;
    if (!room || !id) return;
    setNetBusy(true);
    setError(null);
    try {
      const next = await startDuel(room, id);
      applySnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start.");
    } finally {
      setNetBusy(false);
    }
  }, [applySnapshot]);

  const dispatch = useCallback((event: SessionEvent) => {
    if (
      event.type === "undo" ||
      event.type === "start" ||
      event.type === "reset"
    ) {
      return;
    }

    const transition = sessionReducer(sessionRef.current, event);
    setSession(transition.state);

    if (transition.effect?.kind === "apply") {
      const room = codeRef.current;
      const id = clientRef.current;
      if (!room || !id) return;
      void duelAction(room, id, transition.effect.request.action)
        .then((next) => {
          applySnapshot(next);
        })
        .catch((err: unknown) => {
          setSession((prev) => ({
            ...prev,
            inFlight: null,
            error: err instanceof Error ? err.message : "Action failed.",
          }));
        });
      return;
    }

    // Duel never runs init/legal through the solo session effects.
    if (transition.effect) {
      setSession((prev) => ({ ...prev, inFlight: null }));
    }
  }, [applySnapshot]);

  const selectAction = useCallback(
    (option: PlaytestActionOption) => {
      dispatch({ type: "selectAction", option });
    },
    [dispatch],
  );

  const leave = useCallback(() => {
    clearDuelRejoinCookie();
    setPhase("idle");
    setCode(null);
    setClientId(null);
    setSeat(null);
    setSnapshot(null);
    setSession(initialSessionState);
    setError(null);
    setRestoring(false);
  }, []);

  const isController =
    seat != null && snapshot != null && snapshot.controller === seat;

  const bothReady =
    snapshot?.seats.A.ready === true && snapshot?.seats.B.ready === true;

  const opponentSeat: SeatId | null = seat === "A" ? "B" : seat === "B" ? "A" : null;

  return {
    phase,
    code,
    seat,
    snapshot,
    session,
    error,
    setError,
    busy: netBusy || isSessionBusy(session) || restoring,
    bootstrapped,
    restoring,
    isController,
    bothReady,
    opponentSeat,
    beginCreate,
    beginJoin,
    submitReady,
    submitStart,
    selectAction,
    dispatch,
    leave,
  };
}

export type DuelSession = ReturnType<typeof useDuelSession>;
