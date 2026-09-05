"use client";

import type { PlaytestAction } from "@ga-fire/contracts";
import { CARDS, type CardId } from "@/lib/engine";
import { cn, buttonVariants } from "@/lib/utils";
import { SectionHeading, HandCard } from "../../ui";

export {
  discardHandFor,
  discardOptionalFor,
  discardStepDrawnIndex,
  discardStepHand,
  discardStepOptional,
  discardStepsFor,
  drawnDiscardIndexFor,
  excludedIndicesForDiscard,
  hasDiscardSelection,
  needsDiscardPicker,
  withDiscardChoice,
  withDiscardChoices,
} from "@ga-fire/game";
export type { DiscardStepLike as PlaytestDiscardStep } from "@ga-fire/game";

export type DiscardPrompt = Readonly<{
  label: string;
  action: PlaytestAction;
  hand: string[];
  excludedIndices: number[];
  optional: boolean;
  drawnIndex: number | null;
  stepIndex: number;
  stepCount: number;
}>;

export function DiscardPicker({
  prompt,
  selectedIndex,
  busy,
  onSelect,
  onSkip,
  onCancel,
}: {
  prompt: DiscardPrompt;
  selectedIndex: number | null;
  busy: boolean;
  onSelect: (handIndex: number) => void;
  onCancel: () => void;
  onSkip?: () => void;
}) {
  const stepLabel =
    prompt.stepCount > 1
      ? `${prompt.label} (${prompt.stepIndex + 1}/${prompt.stepCount})`
      : prompt.label;

  return (
    <div className="mb-2 border border-primary/40 bg-surface-muted px-3 py-3">
      <SectionHeading className="mb-2" title="DISCARD" />
      <p className="mt-0 mb-3 font-mono text-[11px] tracking-[0.06em] text-muted">
        {stepLabel}
        {prompt.optional ? " · Optional" : ""}
      </p>
      <div className="mb-3 grid grid-cols-7 gap-2">
        {prompt.hand.map((id, index) => {
          const excluded = prompt.excludedIndices.includes(index);
          const selected = selectedIndex === index;
          const drawn = prompt.drawnIndex === index;
          return (
            <button
              key={`discard-${id}-${index}`}
              type="button"
              className={cn(
                "relative border-0 bg-transparent p-0 text-left",
                excluded && "cursor-not-allowed opacity-35",
                selected && "ring-2 ring-primary ring-offset-1",
                drawn && !selected && "ring-2 ring-secondary ring-offset-1",
              )}
              onClick={() => {
                if (!excluded && !busy) {
                  onSelect(index);
                }
              }}
              disabled={busy || excluded}
              title={
                excluded
                  ? "Already reserved or being played"
                  : drawn
                    ? `Just drawn · ${CARDS[id as CardId]?.name ?? id}`
                    : (CARDS[id as CardId]?.name ?? id)
              }
            >
              <HandCard id={id as CardId} faded={excluded} />
              {drawn ? (
                <span className="absolute top-1 right-1 bg-secondary px-1 font-mono text-[9px] tracking-wide text-white uppercase">
                  Drawn
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {prompt.optional && onSkip ? (
          <button
            type="button"
            className={buttonVariants({ intent: "secondary" })}
            onClick={onSkip}
            disabled={busy}
          >
            Skip discard
          </button>
        ) : null}
        <button
          type="button"
          className={buttonVariants({ intent: "secondary" })}
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
