"use client";

import type { PlaytestAction } from "@ga-fire/contracts";
import { CARDS, type CardId } from "@/lib/engine";
import { cn, buttonVariants } from "@/lib/utils";
import { SectionHeading, HandCard } from "../../ui";

export type DiscardPrompt = Readonly<{
  label: string;
  action: PlaytestAction;
  hand: string[];
  excludedIndices: number[];
  optional: boolean;
  drawnIndex: number | null;
}>;

export function discardHandFor(option: {
  discardHand?: string[];
  discard_hand?: string[];
}): string[] {
  return option.discardHand ?? option.discard_hand ?? [];
}

export function needsDiscardPicker(option: {
  discardHand?: string[];
  discard_hand?: string[];
}): boolean {
  return discardHandFor(option).length > 0;
}

export function drawnDiscardIndexFor(option: {
  drawnDiscardIndex?: number;
  drawn_discard_index?: number;
}): number | null {
  const index = option.drawnDiscardIndex ?? option.drawn_discard_index;
  return index ?? null;
}

export function discardOptionalFor(option: {
  discardOptional?: boolean;
  discard_optional?: boolean;
}): boolean {
  return option.discardOptional ?? option.discard_optional ?? false;
}

export function excludedIndicesForDiscard(
  hand: string[],
  playedCard: string | null,
  reservedIndices: number[],
): number[] {
  const excluded = new Set(reservedIndices);
  if (playedCard) {
    for (let index = 0; index < hand.length; index += 1) {
      if (hand[index] === playedCard && !excluded.has(index)) {
        excluded.add(index);
        break;
      }
    }
  }
  return [...excluded];
}

export function hasDiscardSelection(action: PlaytestAction): boolean {
  const raw = action as PlaytestAction & {
    skipDiscard?: boolean;
    skip_discard?: boolean;
    discardHandIndex?: number;
    discard_hand_index?: number;
  };
  return (
    raw.skipDiscard === true ||
    raw.skip_discard === true ||
    raw.discardHandIndex != null ||
    raw.discard_hand_index != null
  );
}

export function withDiscardChoice(
  action: PlaytestAction,
  choice: { skip: true } | { handIndex: number },
): PlaytestAction {
  switch (action.op) {
    case "playAlly":
    case "attackArthur":
    case "attackOthers":
      return {
        ...action,
        skipDiscard: "skip" in choice ? true : undefined,
        discardHandIndex: "handIndex" in choice ? choice.handIndex : undefined,
      } as PlaytestAction;
    default:
      return action;
  }
}

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
  return (
    <div className="mb-2 border border-primary/40 bg-surface-muted px-3 py-3">
      <SectionHeading className="mb-2" title="DISCARD" />
      <p className="mt-0 mb-3 font-mono text-[11px] tracking-[0.06em] text-muted">
        {prompt.label}
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
