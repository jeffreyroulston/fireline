"use client";

import { useState, type ReactNode } from "react";

import { cn } from "./ui/cn";

const panelClass =
  "rounded-xl border border-border bg-surface p-5 shadow-[0_1px_0_rgba(16,42,48,0.06)]";

const buttonClass =
  "rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-45";

const primaryButtonClass =
  "rounded-md border border-primary-dark bg-primary px-4 py-2.5 text-sm font-semibold tracking-wide text-white uppercase transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-45";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-accent";

export type LobbyScreenProps = {
  busy?: boolean;
  error?: string | null;
  onSolo: () => void;
  onCreateDuel: () => void;
  onJoinDuel: (code: string) => void;
};

export function LobbyScreen({
  busy = false,
  error = null,
  onSolo,
  onCreateDuel,
  onJoinDuel,
}: LobbyScreenProps) {
  const [joinCode, setJoinCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const displayError = error ?? localError;

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setLocalError("Enter the duel code from your opponent.");
      return;
    }
    setLocalError(null);
    onJoinDuel(code);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-wide text-primary uppercase">
          Fireline Play
        </h1>
        <p className="mt-2 text-sm text-muted">
          Solo Spirit line, or a champion duel across two boards.
        </p>
      </header>

      <section className={cn(panelClass, "flex flex-col gap-3")}>
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Solo
        </h2>
        <p className="text-sm text-muted">
          One FiZa board against Spirit of Fire.
        </p>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy}
          onClick={onSolo}
        >
          Play solo
        </button>
      </section>

      <section className={cn(panelClass, "flex flex-col gap-3")}>
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Champion duel
        </h2>
        <p className="text-sm text-muted">
          Two players, opposite sides. Each brings a deck. Pass ends your turn.
        </p>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={onCreateDuel}
        >
          {busy ? "Creating…" : "Create duel"}
        </button>
        <div className="flex flex-wrap gap-2">
          <input
            className={cn(inputClass, "min-w-0 flex-1 font-mono uppercase tracking-widest")}
            placeholder="CODE"
            value={joinCode}
            maxLength={8}
            disabled={busy}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleJoin();
            }}
          />
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={handleJoin}
          >
            Join
          </button>
        </div>
      </section>

      {displayError ? (
        <p
          className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary-dark"
          role="alert"
        >
          {displayError}
        </p>
      ) : null}
    </div>
  );
}

export type DuelWaitingProps = {
  code: string;
  seat: "A" | "B";
  bothReady: boolean;
  opponentJoined: boolean;
  youReady: boolean;
  canStart: boolean;
  busy?: boolean;
  error?: string | null;
  onStart: () => void;
  onLeave: () => void;
  children?: ReactNode;
};

export function DuelWaitingPanel({
  code,
  seat,
  bothReady,
  opponentJoined,
  youReady,
  canStart,
  busy = false,
  error = null,
  onStart,
  onLeave,
}: DuelWaitingProps) {
  return (
    <div className={cn(panelClass, "mx-auto flex w-full max-w-lg flex-col gap-4")}>
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Duel code
        </p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[0.2em] text-primary">
          {code}
        </p>
        <p className="mt-2 text-sm text-muted">
          You are seat {seat}
          {seat === "A" ? " (host)" : ""}.
        </p>
      </div>

      <ul className="m-0 list-none space-y-2 p-0 text-sm">
        <li className="flex justify-between gap-3">
          <span className="text-muted">Opponent</span>
          <span>{opponentJoined ? "Joined" : "Waiting…"}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-muted">Your setup</span>
          <span>{youReady ? "Ready" : "Not ready"}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="text-muted">Both ready</span>
          <span>{bothReady ? "Yes" : "No"}</span>
        </li>
      </ul>

      {error ? (
        <p
          className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary-dark"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        {canStart ? (
          <button
            type="button"
            className={primaryButtonClass}
            disabled={busy || !bothReady || !opponentJoined}
            onClick={onStart}
          >
            {busy ? "Starting…" : "Start duel"}
          </button>
        ) : (
          <p className="text-center text-sm text-muted">
            {youReady
              ? "Waiting for the host to start…"
              : "Finish setup and ready up."}
          </p>
        )}
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={onLeave}
        >
          Leave
        </button>
      </div>
    </div>
  );
}
