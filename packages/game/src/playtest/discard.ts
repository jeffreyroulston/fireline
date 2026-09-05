import type { PlaytestAction } from "@ga-fire/contracts";

/** Tolerant view of a discard step: the worker sends camelCase, older tapes snake. */
export type DiscardStepLike = Readonly<{
  label: string;
  discardOptional?: boolean;
  discard_optional?: boolean;
  discardHand?: string[];
  discard_hand?: string[];
  drawnDiscardIndex?: number | null;
  drawn_discard_index?: number | null;
}>;

type DiscardOptionLike = {
  discardSteps?: DiscardStepLike[];
  discard_steps?: DiscardStepLike[];
  discardHand?: string[];
  discard_hand?: string[];
  discardOptional?: boolean;
  discard_optional?: boolean;
  drawnDiscardIndex?: number | null;
  drawn_discard_index?: number | null;
};

export function discardStepsFor(option: DiscardOptionLike): DiscardStepLike[] {
  return option.discardSteps ?? option.discard_steps ?? [];
}

export function discardHandFor(option: DiscardOptionLike): string[] {
  return option.discardHand ?? option.discard_hand ?? [];
}

export function needsDiscardPicker(option: DiscardOptionLike): boolean {
  return (
    discardStepsFor(option).length > 0 || discardHandFor(option).length > 0
  );
}

export function drawnDiscardIndexFor(option: DiscardOptionLike): number | null {
  const index = option.drawnDiscardIndex ?? option.drawn_discard_index;
  return index ?? null;
}

export function discardOptionalFor(option: DiscardOptionLike): boolean {
  return option.discardOptional ?? option.discard_optional ?? false;
}

export function discardStepOptional(step: DiscardStepLike): boolean {
  return step.discardOptional ?? step.discard_optional ?? false;
}

export function discardStepHand(step: DiscardStepLike): string[] {
  return step.discardHand ?? step.discard_hand ?? [];
}

export function discardStepDrawnIndex(step: DiscardStepLike): number | null {
  const index = step.drawnDiscardIndex ?? step.drawn_discard_index;
  return index ?? null;
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

/** `null` in `choices` means skip that step. */
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
