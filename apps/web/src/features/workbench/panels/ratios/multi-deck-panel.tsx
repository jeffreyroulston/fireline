"use client";

import { useState } from "react";
import {
  formatDecklist,
  listToCounts,
  parseDecklist,
  type DeckCounts,
} from "@/lib/engine";
import { buttonVariants } from "@/lib/utils/variants";
import { cn } from "@/lib/utils";
import { SecondaryActionButton } from "@/components/secondary-action-button";
import { SectionHeading } from "../../ui";
import { RatioChangeCards } from "./ratio-change-cards";
import {
  deckCountsTotal,
  deckDiffEntries,
  isSameDeckCounts,
  ratioCriteriaPanelClass,
  ratioRefineHintClass,
  ratioSaveDeckClass,
} from "./shared";

type MultiDeckPanelProps = Readonly<{
  decks: readonly DeckCounts[];
  deckSize: number;
  baseCounts: DeckCounts;
  baseDeckName?: string;
  onAdd: (counts: DeckCounts) => string | null;
  onRemove: (index: number) => void;
  onClear: () => void;
}>;

export function MultiDeckPanel({
  decks,
  deckSize,
  baseCounts,
  baseDeckName,
  onAdd,
  onRemove,
  onClear,
}: MultiDeckPanelProps) {
  const [draftText, setDraftText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function handleAddCurrentDeck() {
    const error = onAdd(baseCounts);
    setAddError(error);
  }

  function handleAddFromText() {
    const counts = listToCounts(parseDecklist(draftText));
    const error = onAdd(counts);
    if (error) {
      setAddError(error);
      return;
    }
    setDraftText("");
    setAddError(null);
  }

  return (
    <div className={ratioCriteriaPanelClass}>
      <SectionHeading
        title="MULTI-DECK TEST"
        meta={<strong>{decks.length} lists queued</strong>}
      />
      <p className={ratioRefineHintClass}>
        Add decklists to score together. Each list is evaluated independently
        and ranked by damage — there is no baseline deck in this mode.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={ratioSaveDeckClass()}
          onClick={handleAddCurrentDeck}
        >
          Add current deck
        </button>
        {baseDeckName && (
          <span className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
            {baseDeckName}
          </span>
        )}
      </div>

      <label className="grid gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
          Paste decklist
        </span>
        <textarea
          className="min-h-[140px] resize-y border border-border bg-surface p-3 font-mono text-xs leading-[1.8]"
          value={draftText}
          placeholder={"3 Clumsy Apprentice\n3 Rending Flames\n..."}
          spellCheck={false}
          onChange={(event) => {
            setDraftText(event.target.value);
            setAddError(null);
          }}
        />
        <SecondaryActionButton
          className="w-fit shrink-0"
          disabled={draftText.trim().length === 0}
          onClick={handleAddFromText}
        >
          Add pasted list
        </SecondaryActionButton>
      </label>

      {addError && (
        <p className="m-0 text-sm text-primary-dark" role="alert">
          {addError}
        </p>
      )}

      {decks.length === 0 ? (
        <p className={ratioRefineHintClass}>
          Queue at least one decklist, or re-test selected lists from a previous
          ratio run.
        </p>
      ) : (
        <ol className="grid list-none gap-2 p-0">
          {decks.map((counts, index) => {
            const total = deckCountsTotal(counts);
            const isBaseline = isSameDeckCounts(baseCounts, counts);
            const changes = isBaseline
              ? []
              : deckDiffEntries(baseCounts, counts);
            return (
              <li
                key={`multi-deck-${index}-${formatDecklist(counts).slice(0, 40)}`}
                className="flex flex-wrap items-start justify-between gap-3 border border-border bg-surface px-3 py-2.5"
              >
                <div className="grid min-w-0 flex-1 gap-2">
                  {isBaseline ? (
                    <span className="font-mono text-[11px] tracking-[0.06em] text-foreground uppercase">
                      {baseDeckName?.trim() || "Current deck"}
                    </span>
                  ) : (
                    <RatioChangeCards changes={changes} />
                  )}
                  <span className="font-mono text-[10px] text-muted">
                    {total} cards
                    {total !== deckSize ? ` · expected ${deckSize}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ intent: "text", size: "compact" }),
                    "font-mono text-[10px] uppercase",
                  )}
                  onClick={() => onRemove(index)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {decks.length > 0 && (
        <button
          type="button"
          className={cn(
            buttonVariants({ intent: "text", size: "compact" }),
            "justify-self-start font-mono text-[10px] uppercase",
          )}
          onClick={onClear}
        >
          Clear queue
        </button>
      )}
    </div>
  );
}
