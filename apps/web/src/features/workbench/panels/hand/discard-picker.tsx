"use client";

import type { PlaytestAction } from "@ga-fire/contracts";
import { CARDS, type CardId } from "@/lib/engine";
import { cn, buttonVariants } from "@/lib/utils";
import { SectionHeading, HandCard } from "../../ui";

export type PlaytestDiscardStep = Readonly<{
  label: string;
  discardOptional?: boolean;
  discard_optional?: boolean;
  discardHand?: string[];
  discard_hand?: string[];
  drawnDiscardIndex?: number | null;
  drawn_discard_index?: number | null;
}>;

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

export function discardStepsFor(option: {
  discardSteps?: PlaytestDiscardStep[];
  discard_steps?: PlaytestDiscardStep[];
}): PlaytestDiscardStep[] {
  return option.discardSteps ?? option.discard_steps ?? [];
}

export function discardHandFor(option: {
  discardHand?: string[];
  discard_hand?: string[];
}): string[] {
  return option.discardHand ?? option.discard_hand ?? [];
}

export function needsDiscardPicker(option: {
  discardSteps?: PlaytestDiscardStep[];
  discard_steps?: PlaytestDiscardStep[];
  discardHand?: string[];
  discard_hand?: string[];
}): boolean {
  return (
    discardStepsFor(option).length > 0 || discardHandFor(option).length > 0
  );
}

export function drawnDiscardIndexFor(option: {
  drawnDiscardIndex?: number | null;
  drawn_discard_index?: number | null;
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

export function discardStepOptional(step: PlaytestDiscardStep): boolean {
  return step.discardOptional ?? step.discard_optional ?? false;
}

export function discardStepHand(step: PlaytestDiscardStep): string[] {
  return step.discardHand ?? step.discard_hand ?? [];
}

export function discardStepDrawnIndex(step: PlaytestDiscardStep): number | null {
  const index = step.drawnDiscardIndex ?? step.drawn_discard_index;
  return index ?? null;
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
    discardHandIndices?: Array<number | null>;
    discard_hand_indices?: Array<number | null>;
  };
  if ((raw.discardHandIndices ?? raw.discard_hand_indices ?? []).length > 0) {
    return true;
  }
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
  return withDiscardChoices(action, [
    "skip" in choice ? null : choice.handIndex,
  ]);
}

export function withDiscardChoices(
  action: PlaytestAction,
  choices: Array<number | null>,
): PlaytestAction {
  switch (action.op) {
    case "playAlly":
      return {
        ...action,
        skip_discard: choices[0] === null ? true : null,
        discard_hand_index: choices[0] ?? null,
      };
    case "attackArthur":
    case "attackOthers":
      return {
        ...action,
        skip_discard: null,
        discard_hand_index: null,
        discard_hand_indices: choices,
      };
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
