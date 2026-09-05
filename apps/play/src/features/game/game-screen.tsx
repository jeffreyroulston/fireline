"use client";

import { useState } from "react";
import type { PlaytestActionOption } from "@ga-fire/contracts";
import {
  ENEMY_CHAMPION_LIFE,
  enemyChampionDefeated,
} from "@ga-fire/game";

import { Board, EventLog } from "./board";
import { DeckBuilderScreen } from "./decks";
import { DuelWaitingPanel, LobbyScreen } from "./lobby-screen";
import { PaymentOverlay } from "./overlays";
import { SetupScreen } from "./setup";
import { cn } from "./ui/cn";
import { useDuelSession } from "./use-duel-session";
import { useGameSession } from "./use-game-session";

const toolbarButtonClass =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-45";

type PlayMode = "lobby" | "solo" | "duel";
type SetupView = "setup" | "deck-builder";

export function GameScreen() {
  const [mode, setMode] = useState<PlayMode>("lobby");
  const solo = useGameSession();
  const duel = useDuelSession();

  if (!duel.bootstrapped) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-muted p-8">
        <p className="text-sm text-muted">
          {duel.restoring ? "Rejoining duel…" : "Loading…"}
        </p>
      </main>
    );
  }

  // Cookie rejoin: jump straight into the duel UI.
  if (mode === "lobby" && duel.phase !== "idle") {
    return (
      <DuelScreen
        duel={duel}
        onLeave={() => {
          duel.leave();
          setMode("lobby");
        }}
      />
    );
  }

  if (mode === "lobby" && duel.phase === "idle") {
    return (
      <main className="min-h-screen bg-surface-muted px-4 py-8">
        <LobbyScreen
          busy={duel.busy}
          error={duel.error}
          onSolo={() => {
            duel.setError(null);
            setMode("solo");
          }}
          onCreateDuel={() => {
            setMode("duel");
            void duel.beginCreate();
          }}
          onJoinDuel={(code) => {
            setMode("duel");
            void duel.beginJoin(code);
          }}
        />
      </main>
    );
  }

  if (mode === "duel") {
    return (
      <DuelScreen
        duel={duel}
        onLeave={() => {
          duel.leave();
          setMode("lobby");
        }}
      />
    );
  }

  return (
    <SoloScreen
      solo={solo}
      onBackToLobby={() => {
        solo.dispatch({ type: "reset" });
        setMode("lobby");
      }}
    />
  );
}

function SoloScreen({
  solo,
  onBackToLobby,
}: {
  solo: ReturnType<typeof useGameSession>;
  onBackToLobby: () => void;
}) {
  const { state, dispatch, busy, canUndo } = solo;
  const [setupView, setSetupView] = useState<SetupView>("setup");
  const [preferredDeckId, setPreferredDeckId] = useState<string | null>(null);

  if (state.status === "setup") {
    if (setupView === "deck-builder") {
      return (
        <main className="min-h-screen bg-surface-muted px-4 py-8">
          <DeckBuilderScreen
            onDone={(deckId) => {
              setPreferredDeckId(deckId);
              setSetupView("setup");
            }}
          />
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-surface-muted px-4 py-8">
        <div className="mx-auto mb-4 flex max-w-4xl justify-start">
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={onBackToLobby}
          >
            Lobby
          </button>
        </div>
        <SetupScreen
          preferredDeckId={preferredDeckId}
          onManageDecks={() => setSetupView("deck-builder")}
          onStart={(request) => dispatch({ type: "start", request })}
          busy={busy}
          error={state.error}
        />
      </main>
    );
  }

  if (state.status === "done" && state.board) {
    return (
      <TerminalScreen
        damage={state.board.damage}
        turn={state.board.turn}
        events={state.events}
        error={state.error}
        busy={busy}
        canUndo={canUndo}
        onUndo={() => dispatch({ type: "undo" })}
        onNewGame={() => dispatch({ type: "reset" })}
      />
    );
  }

  if (state.board) {
    return (
      <div className="relative min-h-screen">
        <Board
          board={state.board}
          events={state.events}
          legalActions={state.legalActions}
          onSelect={(option: PlaytestActionOption) =>
            dispatch({ type: "selectAction", option })
          }
        />

        <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(toolbarButtonClass, "pointer-events-auto")}
            disabled={busy || !canUndo}
            onClick={() => dispatch({ type: "undo" })}
          >
            Undo
          </button>
          <button
            type="button"
            className={cn(toolbarButtonClass, "pointer-events-auto")}
            disabled={busy}
            onClick={() => dispatch({ type: "reset" })}
          >
            New game
          </button>
          <button
            type="button"
            className={cn(toolbarButtonClass, "pointer-events-auto")}
            disabled={busy}
            onClick={onBackToLobby}
          >
            Lobby
          </button>
        </div>

        {state.error ? (
          <div
            className="absolute top-16 right-3 z-20 max-w-sm rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary-dark shadow-sm"
            role="alert"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="m-0">{state.error}</p>
              <button
                type="button"
                className="shrink-0 font-mono text-xs uppercase tracking-wide text-primary-dark/80 hover:text-primary-dark"
                onClick={() => dispatch({ type: "setError", message: null })}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <PaymentOverlay
          prompt={state.prompt}
          busy={busy}
          onToggleReserve={(handIndex) =>
            dispatch({ type: "toggleReserve", handIndex })
          }
          onConfirmReserve={() => dispatch({ type: "confirmReserve" })}
          onChooseDiscard={(handIndex) =>
            dispatch({ type: "chooseDiscard", handIndex })
          }
          onSkipDiscard={() => dispatch({ type: "skipDiscard" })}
          onCancel={() => dispatch({ type: "cancelPrompt" })}
        />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted p-8">
      <p className="text-sm text-muted">Loading session…</p>
    </main>
  );
}

function DuelScreen({
  duel,
  onLeave,
}: {
  duel: ReturnType<typeof useDuelSession>;
  onLeave: () => void;
}) {
  const {
    phase,
    code,
    seat,
    snapshot,
    session,
    error,
    setError,
    busy,
    isController,
    bothReady,
    opponentSeat,
    submitReady,
    submitStart,
    selectAction,
    dispatch,
  } = duel;
  const [setupView, setSetupView] = useState<SetupView>("setup");
  const [preferredDeckId, setPreferredDeckId] = useState<string | null>(null);

  if (phase === "idle" || !code || !seat) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted p-8">
        <p className="text-sm text-muted">
          {busy ? "Connecting to duel…" : "Returning to lobby…"}
        </p>
        {error ? (
          <p className="text-sm text-primary-dark" role="alert">
            {error}
          </p>
        ) : null}
        {!busy ? (
          <button type="button" className={toolbarButtonClass} onClick={onLeave}>
            Lobby
          </button>
        ) : null}
      </main>
    );
  }

  if (setupView === "deck-builder" && (phase === "setup" || phase === "waiting")) {
    return (
      <main className="min-h-screen bg-surface-muted px-4 py-8">
        <DeckBuilderScreen
          onDone={(deckId) => {
            setPreferredDeckId(deckId);
            setSetupView("setup");
          }}
        />
      </main>
    );
  }

  if (phase === "setup") {
    return (
      <main className="min-h-screen bg-surface-muted px-4 py-8">
        <div className="mx-auto mb-6 max-w-4xl">
          <DuelWaitingPanel
            code={code}
            seat={seat}
            bothReady={bothReady}
            opponentJoined={snapshot?.seats.B.hasClient === true}
            youReady={snapshot?.seats[seat].ready === true}
            canStart={false}
            busy={busy}
            error={error}
            onStart={() => void submitStart()}
            onLeave={onLeave}
          />
        </div>
        <SetupScreen
          title="Your duel setup"
          subtitle={`Room ${code} · seat ${seat}. Pick a deck — hand and turn order are randomized.`}
          submitLabel="Ready"
          submitBusyLabel="Readying…"
          preferredDeckId={preferredDeckId}
          onManageDecks={() => setSetupView("deck-builder")}
          onStart={(request) => void submitReady(request)}
          busy={busy}
          error={null}
        />
      </main>
    );
  }

  if (phase === "waiting") {
    const youReady = snapshot?.seats[seat].ready === true;
    return (
      <main className="min-h-screen bg-surface-muted px-4 py-8">
        <DuelWaitingPanel
          code={code}
          seat={seat}
          bothReady={bothReady}
          opponentJoined={
            seat === "A"
              ? snapshot?.seats.B.hasClient === true
              : snapshot?.seats.A.hasClient === true
          }
          youReady={youReady}
          canStart={seat === "A"}
          busy={busy}
          error={error}
          onStart={() => void submitStart()}
          onLeave={onLeave}
        />
        {!youReady ? (
          <div className="mx-auto mt-8 max-w-4xl">
            <SetupScreen
              title="Your duel setup"
              subtitle={`Room ${code} · seat ${seat}. Pick a deck — hand and turn order are randomized.`}
              submitLabel="Ready"
              submitBusyLabel="Readying…"
              preferredDeckId={preferredDeckId}
              onManageDecks={() => setSetupView("deck-builder")}
              onStart={(request) => void submitReady(request)}
              busy={busy}
              error={null}
            />
          </div>
        ) : null}
      </main>
    );
  }

  if (
    (phase === "playing" || phase === "done") &&
    session.board &&
    snapshot &&
    opponentSeat
  ) {
    const opp = snapshot.seats[opponentSeat];
    const mine = snapshot.seats[seat];
    const won = snapshot.winnerSeat === seat;
    const lost = snapshot.winnerSeat != null && snapshot.winnerSeat !== seat;

    if (phase === "done") {
      return (
        <div className="relative flex h-[100dvh] flex-col items-center justify-center gap-6 bg-surface-muted p-8">
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Duel over
            </p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-5xl font-bold leading-none">
              {won ? "Victory" : lost ? "Defeat" : "Game over"}
            </p>
            <p className="mt-4 text-sm text-muted">
              Your life {mine.championLife} · Opponent {opp.championLife}
            </p>
          </div>
          {error ? (
            <p className="max-w-md text-sm text-primary-dark" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className={toolbarButtonClass} onClick={onLeave}>
            Lobby
          </button>
          <EventLog events={session.events} defaultOpen />
        </div>
      );
    }

    const banner = isController
      ? "Your turn — End Main phase passes control"
      : "Opponent turn";

    return (
      <div className="relative min-h-screen">
        <Board
          board={session.board}
          events={session.events}
          legalActions={isController ? session.legalActions : []}
          onSelect={selectAction}
          championLife={mine.championLife}
          banner={banner}
          opponent={
            opp.board
              ? {
                  board: opp.board,
                  championLife: opp.championLife,
                  maxLife: ENEMY_CHAMPION_LIFE,
                }
              : null
          }
        />

        <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-wrap gap-2">
          <span
            className={cn(
              toolbarButtonClass,
              "pointer-events-none border-accent/40 bg-black/60 text-accent",
            )}
          >
            {code} · seat {seat}
          </span>
          <button
            type="button"
            className={cn(toolbarButtonClass, "pointer-events-auto")}
            disabled={busy}
            onClick={onLeave}
          >
            Leave
          </button>
        </div>

        {error || session.error ? (
          <div
            className="absolute top-16 right-3 z-20 max-w-sm rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary-dark shadow-sm"
            role="alert"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="m-0">{error ?? session.error}</p>
              <button
                type="button"
                className="shrink-0 font-mono text-xs uppercase tracking-wide text-primary-dark/80 hover:text-primary-dark"
                onClick={() => {
                  setError(null);
                  dispatch({ type: "setError", message: null });
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <PaymentOverlay
          prompt={session.prompt}
          busy={busy}
          onToggleReserve={(handIndex) =>
            dispatch({ type: "toggleReserve", handIndex })
          }
          onConfirmReserve={() => dispatch({ type: "confirmReserve" })}
          onChooseDiscard={(handIndex) =>
            dispatch({ type: "chooseDiscard", handIndex })
          }
          onSkipDiscard={() => dispatch({ type: "skipDiscard" })}
          onCancel={() => dispatch({ type: "cancelPrompt" })}
        />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted p-8">
      <p className="text-sm text-muted">Loading duel…</p>
    </main>
  );
}

type TerminalScreenProps = {
  damage: number;
  turn: number;
  events: ReturnType<typeof useGameSession>["state"]["events"];
  error: string | null;
  busy: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onNewGame: () => void;
};

function TerminalScreen({
  damage,
  turn,
  events,
  error,
  busy,
  canUndo,
  onUndo,
  onNewGame,
}: TerminalScreenProps) {
  const won = enemyChampionDefeated(damage);
  return (
    <div className="relative h-[100dvh] overflow-hidden bg-surface-muted">
      <main className="flex h-full min-h-0 flex-col items-center justify-center gap-8 p-8">
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {won ? "Victory" : "Line complete"}
          </p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-5xl font-bold leading-none">
            {won ? "Champion defeated" : "Game over"}
          </p>
          <p className="mt-4 font-[family-name:var(--font-display)] text-7xl font-bold tabular-nums leading-none text-primary">
            {damage}
          </p>
          <p className="mt-3 text-sm text-muted">
            {won
              ? `Dealt ${damage} damage · Spirit of Fire (${ENEMY_CHAMPION_LIFE} life) · turn ${turn + 1}`
              : `Damage ${damage} / ${ENEMY_CHAMPION_LIFE} · turn ${turn + 1}`}
          </p>
        </div>

        {error ? (
          <p
            className="max-w-md rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary-dark"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={toolbarButtonClass}
            disabled={busy || !canUndo}
            onClick={onUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className={cn(
              toolbarButtonClass,
              "border-primary-dark bg-primary text-white hover:bg-primary-dark",
            )}
            disabled={busy}
            onClick={onNewGame}
          >
            New game
          </button>
        </div>
      </main>

      <EventLog events={events} defaultOpen />
    </div>
  );
}
