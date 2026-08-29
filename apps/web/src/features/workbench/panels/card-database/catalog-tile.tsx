"use client";

import { cardImageUrl } from "@/lib/card-images";
import type { CardDatabaseCard } from "@/lib/api/client";
import type { CardId } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
} from "@/lib/utils/card-classes";
import { formatLift } from "./formatters";
import {
  cardDbChipClass,
  cardDbOlderClass,
  cardDbTileClass,
  cardDbTileImageClass,
  cardDbTileNameClass,
  partnerDeltaClass,
} from "./shared";

export interface CatalogTileProps {
  readonly card: CardDatabaseCard;
  readonly onSelect: () => void;
}

export function CatalogTile({ card, onSelect }: CatalogTileProps) {
  const src = cardImageUrl(card.id as CardId);
  const hasStats = card.performance != null;
  const isFire = card.element === "fire";

  return (
    <button
      type="button"
      className={cardDbTileClass(!hasStats)}
      onClick={onSelect}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className={cardDbTileImageClass} />
      ) : (
        <div
          className={cn(
            cardTileClass(isFire),
            cardDbTileImageClass,
            "pointer-events-none min-h-0",
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
      <span className={cardDbTileNameClass}>{card.name}</span>
      {hasStats ? (
        card.performance!.handLift != null ? (
          <span
            className={cn(
              cardDbChipClass(),
              partnerDeltaClass(card.performance!.handLift),
            )}
          >
            Lift {formatLift(card.performance!.handLift)}
          </span>
        ) : (
          <span className={cardDbChipClass(true)}>No lift</span>
        )
      ) : (
        <span className={cardDbChipClass(true)}>No data</span>
      )}
      {!hasStats && card.hasOlderData && (
        <span className={cardDbOlderClass}>Older data</span>
      )}
    </button>
  );
}
