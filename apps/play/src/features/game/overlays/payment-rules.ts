import {
  CARDS,
  cardDisplayName,
  isReserveSelectionComplete,
  type SessionDiscardPrompt,
  type SessionReservePrompt,
} from "@ga-fire/game";

/**
 * Selection rules for the reserve and discard overlays.
 *
 * The session reducer deliberately does not police these: `toggleReserve`
 * toggles whatever slot it is handed, and the prompt it hands us already
 * carries the engine's requirements (`reserveCount`, `fireOnly`,
 * `maxPlayedCopies` from `maxPlayedCopiesReservable`, `excludedIndices` from
 * `excludedIndicesForDiscard`). Enforcement therefore lives here, at the point
 * of the click, exactly as it does in the workbench pickers.
 *
 * Pure and React-free so the rules can be read and tested on their own.
 */

/** Why a hand slot cannot be added to the reserve. */
export type ReserveBlock =
  | "none"
  /** The prompt already has `reserveCount` slots picked. */
  | "reserveFull"
  /** Reserving this would consume the last copy of the card being played. */
  | "playedCopies"
  /** An imbue reserve must be paid with Fire cards. */
  | "notFire";

export type ReserveSlotState = Readonly<{
  index: number;
  cardId: string;
  selected: boolean;
  block: ReserveBlock;
  /** A selected slot stays clickable so the player can always take it back. */
  selectable: boolean;
  reason: string;
}>;

export type DiscardSlotState = Readonly<{
  index: number;
  cardId: string;
  /** Reserved this payment, or the copy being played. */
  excluded: boolean;
  /** The card this action just drew, worth calling out before it is pitched. */
  drawn: boolean;
  selectable: boolean;
  reason: string;
}>;

function isFire(cardId: string): boolean {
  return CARDS[cardId]?.element === "fire";
}

function blockReason(block: ReserveBlock, cardId: string): string {
  switch (block) {
    case "playedCopies":
      return "Cannot reserve every copy of the card being played";
    case "notFire":
      return "Imbue reserve must be Fire";
    case "reserveFull":
      return "Reserve is already paid";
    case "none":
      return cardDisplayName(cardId);
  }
}

export function reserveSlotStates(
  prompt: SessionReservePrompt,
): readonly ReserveSlotState[] {
  const selected = new Set(prompt.selected);
  const reserveFull = prompt.selected.length >= prompt.reserveCount;
  const playedCopiesTaken = prompt.playedCard
    ? prompt.selected.filter((index) => prompt.hand[index] === prompt.playedCard)
        .length
    : 0;

  return prompt.hand.map((cardId, index) => {
    const isSelected = selected.has(index);
    const isPlayedCopy =
      prompt.playedCard != null && cardId === prompt.playedCard;

    // Precedence matches the workbench tooltip order: the played-copy rule is
    // the most surprising, so it gets to explain itself first.
    let block: ReserveBlock = "none";
    if (isPlayedCopy && playedCopiesTaken >= prompt.maxPlayedCopies) {
      block = "playedCopies";
    } else if (prompt.fireOnly && !isFire(cardId)) {
      block = "notFire";
    } else if (reserveFull) {
      block = "reserveFull";
    }

    return {
      index,
      cardId,
      selected: isSelected,
      block,
      selectable: isSelected || block === "none",
      reason: isSelected ? cardDisplayName(cardId) : blockReason(block, cardId),
    };
  });
}

export function discardSlotStates(
  prompt: SessionDiscardPrompt,
): readonly DiscardSlotState[] {
  const excluded = new Set(prompt.excludedIndices);

  return prompt.hand.map((cardId, index) => {
    const isExcluded = excluded.has(index);
    const drawn = prompt.drawnIndex === index;
    const name = cardDisplayName(cardId);
    return {
      index,
      cardId,
      excluded: isExcluded,
      drawn,
      selectable: !isExcluded,
      reason: isExcluded
        ? "Already reserved or being played"
        : drawn
          ? `Just drawn · ${name}`
          : name,
    };
  });
}

/** `true` once enough slots are picked to pay the prompt. */
export function canConfirmReserve(prompt: SessionReservePrompt): boolean {
  return isReserveSelectionComplete(prompt);
}

/**
 * Multi-step attack discards walk one step per attacking ally, so the label
 * needs the position. Single-step discards read as plain prose.
 */
export function discardStepLabel(prompt: SessionDiscardPrompt): string {
  return prompt.stepCount > 1
    ? `${prompt.label} (${prompt.stepIndex + 1}/${prompt.stepCount})`
    : prompt.label;
}
