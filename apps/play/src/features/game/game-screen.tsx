"use client";

import type { PlaytestActionOption } from "@ga-fire/contracts";
import {
  ENEMY_CHAMPION_LIFE,
  enemyChampionDefeated,
} from "@ga-fire/game";

import { Board, EventLog } from "./board";
import { PaymentOverlay } from "./overlays";
import { SetupScreen } from "./setup";
import { cn } from "./ui/cn";
import { useGameSession } from "./use-game-session";

const toolbarButtonClass =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-45";

export function GameScreen() {
  const { state, dispatch, busy, canUndo } = useGameSession();

  if (state.status === "setup") {
    return (
      <main className="min-h-screen bg-surface-muted px-4 py-8">
        <SetupScreen
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
