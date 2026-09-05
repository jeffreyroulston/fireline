"use client";

import { cn } from "../ui/cn";

const controlButtonClass =
  "inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-surface px-1.5 font-mono text-[13px] leading-none text-foreground transition enabled:hover:border-foreground enabled:hover:bg-foreground enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export function DeckCardControls({
  qty,
  canAdd,
  canRemove,
  onAdd,
  onRemove,
  cardName,
}: {
  qty: number;
  canAdd: boolean;
  canRemove: boolean;
  onAdd: () => void;
  onRemove: () => void;
  cardName: string;
}) {
  return (
    <div className="mt-1 flex items-center gap-1">
      <button
        type="button"
        className={controlButtonClass}
        disabled={!canRemove}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove one ${cardName}`}
      >
        −
      </button>
      <span
        className={cn(
          "min-w-[1.5rem] text-center font-[family-name:var(--font-display)] text-sm font-bold tabular-nums",
        )}
        aria-label={`Quantity ${qty}`}
      >
        {qty}
      </span>
      <button
        type="button"
        className={controlButtonClass}
        disabled={!canAdd}
        onClick={(event) => {
          event.stopPropagation();
          onAdd();
        }}
        aria-label={`Add one ${cardName}`}
      >
        +
      </button>
    </div>
  );
}
