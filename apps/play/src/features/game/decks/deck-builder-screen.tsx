"use client";

import { useEffect } from "react";

import { cn } from "../ui/cn";
import { DecksManage } from "./decks-manage";
import { useDeckBuilderState } from "./use-deck-builder-state";

const toolbarButtonClass =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-45";

export type DeckBuilderScreenProps = {
  onDone: (selectedDeckId: string | null) => void;
  className?: string;
};

export function DeckBuilderScreen({
  onDone,
  className,
}: DeckBuilderScreenProps) {
  const state = useDeckBuilderState();

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (state.saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.saving]);

  async function handleDone() {
    await state.flushSaves();
    onDone(state.activeDeck?.id ?? null);
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-wide text-primary uppercase">
            Deck builder
          </h1>
          <p className="mt-2 text-sm text-muted">
            Create and edit play decks. Separate from simulation / workbench
            decks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.saving ? (
            <span className="font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
              Saving…
            </span>
          ) : null}
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => void handleDone()}
          >
            Done
          </button>
        </div>
      </header>

      {state.error ? (
        <p
          className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary-dark"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <DecksManage state={state} />
    </div>
  );
}
