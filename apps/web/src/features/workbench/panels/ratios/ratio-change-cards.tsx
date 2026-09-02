"use client";

import { cardImageUrl } from "@/lib/card-images";
import { CARDS, type CardId } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
} from "@/lib/utils/card-classes";

export type DeckDiffEntry = Readonly<{
  id: CardId;
  from: number;
  to: number;
  delta: number;
}>;

const ratioChangeCardsClass = "flex flex-wrap gap-3";

const ratioChangeCardClass = "grid w-[150px] shrink-0 gap-2.5";

const ratioChangeThumbClass =
  "aspect-[5/7] w-full border border-border object-cover";

const ratioChangeCountClass =
  "m-0 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1 border border-border bg-[color-mix(in_srgb,var(--color-surface-muted)_55%,var(--color-surface))] px-2 py-1.5 font-display text-[17px] leading-none tabular-nums text-foreground";

function RatioChangeArrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-[13px] shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function RatioChangeCard({ change }: Readonly<{ change: DeckDiffEntry }>) {
  const card = CARDS[change.id];
  const src = cardImageUrl(change.id);
  const isFire = card.element === "fire";

  return (
    <article className={ratioChangeCardClass}>
      <div>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            loading="lazy"
            className={ratioChangeThumbClass}
          />
        ) : (
          <div
            className={cn(
              cardTileClass(isFire),
              ratioChangeThumbClass,
              "pointer-events-none flex min-h-0 flex-col p-2",
            )}
          >
            <span className={cardTileAccentClassFor(isFire)} aria-hidden />
            <span className={cn(cardTileLabelClass, isFire && "text-primary-dark")}>
              {card.element}
            </span>
            <b className="text-sm leading-none">{card.name}</b>
            <small className={cardTileMetaClass}>
              {card.cost} · {card.kind}
            </small>
          </div>
        )}
      </div>
      <div className="grid min-w-0 gap-0.5">
        <b className="text-[15px] leading-snug font-semibold text-balance">
          {card.name}
        </b>
        <p className={ratioChangeCountClass}>
          <span className="text-right">{change.from}×</span>
          <span className="flex items-center justify-center">
            <RatioChangeArrow />
          </span>
          <span>{change.to}×</span>
        </p>
      </div>
    </article>
  );
}

export function RatioChangeCards({
  changes,
  className,
}: Readonly<{
  changes: readonly DeckDiffEntry[];
  className?: string;
}>) {
  if (changes.length === 0) {
    return (
      <p className="m-0 font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
        No count changes vs base
      </p>
    );
  }

  return (
    <div className={cn(ratioChangeCardsClass, className)}>
      {changes.map((change) => (
        <RatioChangeCard key={`${change.id}-${change.from}-${change.to}`} change={change} />
      ))}
    </div>
  );
}
