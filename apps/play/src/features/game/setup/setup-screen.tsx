"use client";

import { useState, type ReactNode } from "react";
import type { PlaytestInitRequest } from "@ga-fire/contracts";
import type { CardId } from "@ga-fire/game";
import { OPENING_HAND_SIZE } from "@ga-fire/game";

import { CardTile } from "../ui/card-tile";
import { cn } from "../ui/cn";
import { useSetupState } from "./use-setup-state";

export type SetupScreenProps = {
  onStart: (request: PlaytestInitRequest) => void;
  busy?: boolean;
  error?: string | null;
  className?: string;
};

const panelClass =
  "rounded-xl border border-border bg-surface p-5 shadow-[0_1px_0_rgba(16,42,48,0.06)]";

const labelClass = "text-[11px] font-semibold tracking-[0.12em] text-muted uppercase";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-accent";

const buttonClass =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-45";

const primaryButtonClass =
  "rounded-md border border-primary-dark bg-primary px-4 py-2.5 text-sm font-semibold tracking-wide text-white uppercase transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-45";

export function SetupScreen({
  onStart,
  busy = false,
  error = null,
  className,
}: SetupScreenProps) {
  const setup = useSetupState();
  const [localError, setLocalError] = useStateMessage();

  const displayError = error ?? localError ?? setup.loadError;

  function run(action: () => string | null) {
    const message = action();
    setLocalError(message);
  }

  function handleStart() {
    const result = setup.buildStartRequest();
    if ("error" in result && result.error) {
      setLocalError(result.error);
      return;
    }
    if (!("request" in result)) {
      return;
    }
    setLocalError(null);
    onStart(result.request);
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6", className)}>
      <header className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-wide text-primary uppercase">
          Fireline Play
        </h1>
        <p className="mt-2 text-sm text-muted">
          Pick a deck, shuffle with a seed, and play a hand against the engine.
        </p>
      </header>

      <section className={panelClass}>
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Deck source">
          <SourceTab
            active={setup.deckSource === "saved"}
            onClick={() => setup.setDeckSource("saved")}
          >
            Saved deck
          </SourceTab>
          <SourceTab
            active={setup.deckSource === "paste"}
            onClick={() => setup.setDeckSource("paste")}
          >
            Paste decklist
          </SourceTab>
        </div>

        {setup.deckSource === "saved" ? (
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Deck</span>
            <select
              className={inputClass}
              value={setup.selectedDeckId}
              disabled={setup.decksLoading || setup.decks.length === 0}
              onChange={(event) => setup.setSelectedDeckId(event.target.value)}
            >
              {setup.decks.length === 0 ? (
                <option value="">
                  {setup.decksLoading ? "Loading decks…" : "No saved decks"}
                </option>
              ) : (
                setup.decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Decklist</span>
            <textarea
              className={cn(inputClass, "min-h-40 resize-y font-mono text-[13px] leading-relaxed")}
              value={setup.deckText}
              placeholder="4 Arthur, Young Heir&#10;4 Blazing Throw&#10;…"
              onChange={(event) => setup.setDeckText(event.target.value)}
            />
          </label>
        )}

        <p className="mt-3 text-sm text-muted">
          <strong className="text-foreground">{setup.recognizedCount}</strong>{" "}
          recognized cards
          {setup.deckAnalysis.unrecognizedLines.length > 0 && (
            <span>
              {" "}
              · {setup.deckAnalysis.unrecognizedLines.length} unrecognized line
              {setup.deckAnalysis.unrecognizedLines.length === 1 ? "" : "s"}
            </span>
          )}
        </p>
      </section>

      <section className={panelClass}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
            <span className={labelClass}>Seed</span>
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="Random on empty"
              value={setup.seedInput}
              onChange={(event) => setup.setSeedInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={buttonClass}
            disabled={!setup.canShuffle || busy}
            onClick={() => run(() => setup.applySeedInput())}
          >
            Shuffle
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!setup.canShuffle || busy}
            onClick={() => run(() => setup.drawRandomHand())}
          >
            Draw random hand
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!setup.canShuffle || !setup.shuffled || busy}
            onClick={() => run(() => setup.shuffleDeckOnly())}
          >
            Reshuffle pile
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={labelClass}>Opening hand</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">
              {setup.hand.length} / {OPENING_HAND_SIZE}
              {setup.manualHand ? " · manual" : ""}
            </span>
            {setup.manualHand && (
              <button
                type="button"
                className={buttonClass}
                disabled={!setup.shuffled || busy}
                onClick={() => run(() => setup.resetHandFromShuffle())}
              >
                Reset from shuffle
              </button>
            )}
          </div>
        </div>

        <HandGrid hand={setup.hand} onRemove={setup.removeHandCard} />

        <label className="mt-4 flex flex-col gap-1.5">
          <span className={labelClass}>Add card to hand</span>
          <select
            className={inputClass}
            defaultValue=""
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value as CardId;
              if (value) {
                setup.addHandCard(value);
                event.target.value = "";
              }
            }}
          >
            <option value="">Choose a card…</option>
            {setup.playableCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={cn(panelClass, "grid gap-4 sm:grid-cols-2")}>
        <fieldset className="flex flex-col gap-2">
          <legend className={labelClass}>Turn order</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="turn-order"
              checked={setup.goFirst}
              disabled={busy}
              onChange={() => setup.setGoFirst(true)}
            />
            Play first
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="turn-order"
              checked={!setup.goFirst}
              disabled={busy}
              onChange={() => setup.setGoFirst(false)}
            />
            Draw first
          </label>
        </fieldset>
      </section>

      {displayError && (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary-dark">
          {displayError}
        </p>
      )}

      <div className="flex justify-center pb-8">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy || setup.hand.length < 2 || !setup.shuffled}
          onClick={handleStart}
        >
          {busy ? "Starting…" : "Start game"}
        </button>
      </div>
    </div>
  );
}

function SourceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        buttonClass,
        active && "border-primary bg-primary/10 text-primary-dark",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function HandGrid({
  hand,
  onRemove,
}: {
  hand: readonly CardId[];
  onRemove: (index: number) => void;
}) {
  if (hand.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        Shuffle and draw {OPENING_HAND_SIZE} cards, or build a hand manually.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-2",
        hand.length >= 8 ? "grid-cols-4 sm:grid-cols-8" : "grid-cols-4 sm:grid-cols-7",
      )}
      aria-label="Opening hand"
    >
      {hand.map((id, index) => (
        <CardTile
          key={`hand-${id}-${index}`}
          id={id}
          title={`Remove ${id}`}
          onClick={() => onRemove(index)}
        />
      ))}
    </div>
  );
}

function useStateMessage() {
  const [message, setMessage] = useState<string | null>(null);
  return [message, setMessage] as const;
}
