import type { PlaytestAction, PlaytestStateView } from "@ga-fire/contracts";
import { CARDS } from "../cards";
import type { CardId } from "../types";

export type ReserveRequirement = Readonly<{
  reserveCount: number;
  fireOnly: boolean;
  playedCard: string | null;
}>;

type ReserveOptionLike = {
  reserveCount?: number;
  reserve_count?: number;
  fireOnly?: boolean;
  fire_only?: boolean;
  playedCard?: string | null;
  played_card?: string | null;
};

export function reserveCountFor(option: ReserveOptionLike): number {
  return option.reserveCount ?? option.reserve_count ?? 0;
}

export function reserveOptionMeta(option: ReserveOptionLike): ReserveRequirement {
  return {
    reserveCount: reserveCountFor(option),
    fireOnly: option.fireOnly ?? option.fire_only ?? false,
    playedCard: option.playedCard ?? option.played_card ?? null,
  };
}

function actionCardCost(cardId: string): number {
  return CARDS[cardId as CardId]?.cost ?? 0;
}

/** Mirror of the engine's reserve math, used when an option omits the metadata. */
export function inferReserveRequirement(
  action: PlaytestAction,
  board: PlaytestStateView,
): ReserveRequirement | null {
  switch (action.op) {
    case "playAlly": {
      const cost = actionCardCost(action.card);
      const kindle = Math.min(action.kindle, cost, board.fireGy);
      return {
        reserveCount: Math.max(0, cost - kindle),
        fireOnly: false,
        playedCard: action.card,
      };
    }
    case "playItem": {
      return {
        reserveCount: actionCardCost(action.card),
        fireOnly: false,
        playedCard: action.card,
      };
    }
    case "playAttack": {
      return {
        reserveCount: actionCardCost(action.card),
        fireOnly: false,
        playedCard: action.card,
      };
    }
    case "playAction": {
      const cost = actionCardCost(action.card);
      const kindle = Math.min(action.kindle, cost, board.fireGy);
      return {
        reserveCount: Math.max(0, cost - kindle),
        fireOnly: action.imbue,
        playedCard: action.card,
      };
    }
    case "blazingThrow":
      return {
        reserveCount: 1,
        fireOnly: false,
        playedCard: "blazing_throw",
      };
    default:
      return null;
  }
}

function reservedHandIndicesFor(action: PlaytestAction): number[] {
  const raw = action as PlaytestAction & {
    reservedHandIndices?: number[];
    reserved_hand_indices?: number[];
  };
  return raw.reservedHandIndices ?? raw.reserved_hand_indices ?? [];
}

export function hasReserveSelection(action: PlaytestAction): boolean {
  switch (action.op) {
    case "playAlly":
    case "playItem":
    case "playAttack":
    case "playAction":
    case "blazingThrow":
      return (
        reservedHandIndicesFor(action).length > 0 ||
        (action.reserved?.length ?? 0) > 0
      );
    default:
      return false;
  }
}

/** Take the stricter of the engine-provided metadata and the local inference. */
export function resolveReserveRequirement(
  action: PlaytestAction,
  option: ReserveOptionLike,
  board: PlaytestStateView,
): ReserveRequirement {
  const meta = reserveOptionMeta(option);
  const inferred = inferReserveRequirement(action, board);
  return {
    reserveCount: Math.max(meta.reserveCount, inferred?.reserveCount ?? 0),
    fireOnly: meta.fireOnly || (inferred?.fireOnly ?? false),
    playedCard: meta.playedCard ?? inferred?.playedCard ?? null,
  };
}

export function withReservedHandIndices(
  action: PlaytestAction,
  reservedHandIndices: number[],
): PlaytestAction {
  switch (action.op) {
    case "playAlly":
    case "playItem":
    case "playAttack":
    case "playAction":
    case "blazingThrow":
      return {
        ...action,
        reserved: [],
        reserved_hand_indices: reservedHandIndices,
      };
    default:
      return action;
  }
}

/**
 * Hand slots the player may not discard: everything already reserved, plus one
 * copy of the card being played.
 */
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

/**
 * Reserving every copy of the card being played would leave nothing to play.
 * Returns how many copies of `playedCard` may go into the reserve.
 */
export function maxPlayedCopiesReservable(
  hand: string[],
  playedCard: string | null,
): number {
  if (!playedCard) {
    return 0;
  }
  const copies = hand.filter((id) => id === playedCard).length;
  return Math.max(0, copies - 1);
}
