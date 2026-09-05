"use client";

import type { PlaytestAction } from "@ga-fire/contracts";
import { CARDS, type CardId } from "@/lib/engine";
import { cn, buttonVariants } from "@/lib/utils";
import { SectionHeading, HandCard } from "../../ui";

export {
  hasReserveSelection,
  inferReserveRequirement,
  reserveCountFor,
  reserveOptionMeta,
  resolveReserveRequirement,
  withReservedHandIndices,
} from "@ga-fire/game";

export type ReservePrompt = Readonly<{
  label: string;
  action: PlaytestAction;
  reserveCount: number;
  fireOnly: boolean;
  playedCard: string | null;
  hand: string[];
}>;

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
