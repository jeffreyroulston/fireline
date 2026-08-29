"use client";

import type { CardId } from "@/lib/engine";
import { HandCard } from "../../ui";

export function CardStrip({
  ids,
  empty,
  ariaLabel,
  onRemove,
}: {
  ids: CardId[];
  empty: string;
  ariaLabel: string;
  onRemove: (index: number) => void;
}) {
  return (
    <div
      className="grid min-h-0 grid-cols-7 gap-2"
      aria-label={ariaLabel}
    >
      {ids.map((id, index) => (
        <HandCard
          key={`${ariaLabel}-${id}-${index}`}
          id={id}
          onClick={() => onRemove(index)}
        />
      ))}
      {ids.length === 0 && (
        <p className="col-span-full m-auto self-center text-[13px] leading-[1.6] text-muted">
          {empty}
        </p>
      )}
    </div>
  );
}
