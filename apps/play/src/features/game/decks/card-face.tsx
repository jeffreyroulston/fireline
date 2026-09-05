"use client";

import { cardImageUrl, type CardId, type MaterialId } from "@ga-fire/game";

import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
} from "../ui/card-classes";
import { cn } from "../ui/cn";
import { DeckCardControls } from "./deck-card-controls";
import { resolveDeckCard } from "./shared";

const deckCardImageClass =
  "block aspect-[5/7] w-full border border-foreground/20 bg-foreground/[0.04] object-cover";

export function DeckCardFace({
  id,
  qty,
  editable = false,
  canAdd = false,
  onAdd,
  onRemove,
}: {
  id: CardId | MaterialId;
  qty: number;
  editable?: boolean;
  canAdd?: boolean;
  onAdd?: () => void;
  onRemove?: () => void;
}) {
  const card = resolveDeckCard(id);
  const src = cardImageUrl(id);
  if (!card) return null;

  const isFire = card.element === "fire";

  return (
    <figure className="m-0 mb-3 flex min-w-0 flex-col gap-1 border-b border-border pb-3">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art
        <img src={src} alt={card.name} loading="lazy" className={deckCardImageClass} />
      ) : (
        <div
          className={cn(
            cardTileClass(isFire),
            "pointer-events-none aspect-[5/7] w-full min-h-0",
          )}
        >
          <span className={cardTileAccentClassFor(isFire)} aria-hidden />
          <span className={cn(cardTileLabelClass, isFire && "text-primary-dark")}>
            {card.element}
          </span>
          <b className={cardTileTitleClass}>{card.name}</b>
          <small className={cardTileMetaClass}>
            {card.cost} · {card.kind}
          </small>
        </div>
      )}
      <figcaption className="flex min-w-0 flex-col gap-0.5">
        {editable && onAdd && onRemove ? (
          <>
            <span className="truncate font-[family-name:var(--font-display)] text-[11px] leading-[1.2] text-muted">
              {card.name}
            </span>
            <DeckCardControls
              qty={qty}
              canAdd={canAdd}
              canRemove={qty > 0}
              onAdd={onAdd}
              onRemove={onRemove}
              cardName={card.name}
            />
          </>
        ) : (
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span
              className="shrink-0 font-[family-name:var(--font-display)] text-base leading-none font-bold tracking-[-0.02em] text-foreground"
              aria-label={`Quantity ${qty}`}
            >
              {qty}
            </span>
            <span className="truncate font-[family-name:var(--font-display)] text-[11px] leading-[1.2] text-muted">
              {card.name}
            </span>
          </div>
        )}
      </figcaption>
    </figure>
  );
}
