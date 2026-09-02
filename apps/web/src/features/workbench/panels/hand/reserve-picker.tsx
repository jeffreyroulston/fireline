"use client";

import type {
  PlaytestAction,
  PlaytestStateView,
} from "@ga-fire/contracts";
import { CARDS, type CardId } from "@/lib/engine";
import { cn, buttonVariants } from "@/lib/utils";
import { SectionHeading, HandCard } from "../../ui";

export type ReservePrompt = Readonly<{
  label: string;
  action: PlaytestAction;
  reserveCount: number;
  fireOnly: boolean;
  playedCard: string | null;
  hand: string[];
}>;

export function reserveCountFor(option: {
  reserveCount?: number;
  reserve_count?: number;
}): number {
  return option.reserveCount ?? option.reserve_count ?? 0;
}

export function reserveOptionMeta(option: {
  reserveCount?: number;
  reserve_count?: number;
  fireOnly?: boolean;
  fire_only?: boolean;
  playedCard?: string | null;
  played_card?: string | null;
}) {
  return {
    reserveCount: reserveCountFor(option),
    fireOnly: option.fireOnly ?? option.fire_only ?? false,
    playedCard: option.playedCard ?? option.played_card ?? null,
  };
}

function actionCardCost(cardId: string): number {
  return CARDS[cardId as CardId]?.cost ?? 0;
}

export function inferReserveRequirement(
  action: PlaytestAction,
  board: PlaytestStateView,
): {
  reserveCount: number;
  fireOnly: boolean;
  playedCard: string | null;
} | null {
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

export function resolveReserveRequirement(
  action: PlaytestAction,
  option: {
    reserveCount?: number;
    reserve_count?: number;
    fireOnly?: boolean;
    fire_only?: boolean;
    playedCard?: string | null;
    played_card?: string | null;
  },
  board: PlaytestStateView,
) {
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

export function ReservePicker({
  prompt,
  selectedIndices,
  busy,
  onToggle,
  onConfirm,
  onCancel,
}: {
  prompt: ReservePrompt;
  selectedIndices: number[];
  busy: boolean;
  onToggle: (handIndex: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ready = selectedIndices.length === prompt.reserveCount;
  const playedCount = prompt.playedCard
    ? prompt.hand.filter((id) => id === prompt.playedCard).length
    : 0;
  const maxPlayedReserve = Math.max(0, playedCount - 1);
  const selectedPlayedCount = selectedIndices.filter(
    (index) => prompt.hand[index] === prompt.playedCard,
  ).length;

  return (
    <div className="mb-2 border border-primary/40 bg-surface-muted px-3 py-3">
      <SectionHeading
        className="mb-2"
        title="RESERVE PAYMENT"
        meta={
          <strong>
            {selectedIndices.length}/{prompt.reserveCount}
          </strong>
        }
      />
      <p className="mt-0 mb-3 font-mono text-[11px] tracking-[0.06em] text-muted">
        {prompt.label}
        {prompt.fireOnly ? " · Fire cards only" : ""}
      </p>
      <div className="mb-3 grid grid-cols-7 gap-2">
        {prompt.hand.map((id, index) => {
          const cardId = id as CardId;
          const card = CARDS[cardId];
          const isPlayedType = prompt.playedCard != null && id === prompt.playedCard;
          const isFire = card?.element === "fire";
          const selected = selectedIndices.includes(index);
          const reserveLimitReached =
            !selected && selectedIndices.length >= prompt.reserveCount;
          const playedReserveLimitReached =
            isPlayedType && !selected && selectedPlayedCount >= maxPlayedReserve;
          const disabled =
            busy ||
            reserveLimitReached ||
            playedReserveLimitReached ||
            (prompt.fireOnly && !isFire && !selected);

          return (
            <button
              key={`reserve-${id}-${index}`}
              type="button"
              className={cn(
                "relative border-0 bg-transparent p-0 text-left",
                disabled && !selected && "cursor-not-allowed opacity-45",
                selected && "ring-2 ring-primary ring-offset-1",
              )}
              onClick={() => {
                if (!disabled || selected) {
                  onToggle(index);
                }
              }}
              disabled={disabled && !selected}
              title={
                playedReserveLimitReached
                  ? "Cannot reserve every copy of the card being played"
                  : prompt.fireOnly && !isFire
                    ? "Imbue reserve must be Fire"
                    : undefined
              }
            >
              <HandCard id={cardId} />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonVariants({ intent: "primary" })}
          onClick={onConfirm}
          disabled={busy || !ready}
        >
          Confirm reserve
        </button>
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
