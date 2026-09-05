"use client";

import { useState, type ReactNode } from "react";
import type { PlaytestInitRequest } from "@ga-fire/contracts";
import { OPENING_HAND_SIZE } from "@ga-fire/game";

import { cn } from "../ui/cn";
import { useSetupState } from "./use-setup-state";

export type SetupScreenProps = {
  onStart: (request: PlaytestInitRequest) => void;
  onManageDecks?: () => void;
  preferredDeckId?: string | null;
  busy?: boolean;
  error?: string | null;
  className?: string;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  submitBusyLabel?: string;
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
  onManageDecks,
  preferredDeckId = null,
  busy = false,
  error = null,
  className,
  title = "Fireline Play",
  subtitle = "Pick a deck. Opening hand and turn order are randomized when you start.",
  submitLabel = "Start game",
  submitBusyLabel = "Starting…",
}: SetupScreenProps) {
  const setup = useSetupState({ preferredDeckId });
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = error ?? localError ?? setup.loadError;

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
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted">{subtitle}</p>
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
          <div className="flex flex-col gap-3">
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
            {onManageDecks ? (
              <div>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={onManageDecks}
                >
                  Manage decks
                </button>
              </div>
            ) : null}
          </div>
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
          {setup.canStart ? (
            <span>
              {" "}
              · opens with {OPENING_HAND_SIZE} random cards
            </span>
          ) : null}
        </p>
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
          disabled={busy || !setup.canStart}
          onClick={handleStart}
        >
          {busy ? submitBusyLabel : submitLabel}
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
