"use client";

import { cardImageUrl } from "@/lib/card-images";
import type { CardId } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
} from "@/lib/utils/card-classes";
import { cardDbCardThumbClass } from "./shared";

export interface CardDbCardThumbProps {
  readonly cardId: string;
  readonly name: string;
  readonly element?: string;
  readonly cost?: number;
  readonly kind?: string;
  readonly className?: string;
  readonly fallbackClassName?: string;
}

export function CardDbCardThumb({
  cardId,
  name,
  element,
  cost,
  kind,
  className,
  fallbackClassName,
}: CardDbCardThumbProps) {
  const src = cardImageUrl(cardId as CardId);
  const isFire = element === "fire";
  const thumbClass = cn(cardDbCardThumbClass, className);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={thumbClass} src={src} alt="" />
    );
  }

  return (
    <div
      className={cn(
        cardTileClass(isFire),
        cardDbCardThumbClass,
        "pointer-events-none min-h-0",
        fallbackClassName,
        className,
      )}
    >
      <span className={cardTileAccentClassFor(isFire)} aria-hidden />
      <span className={cn(cardTileLabelClass, isFire && "text-primary-dark")}>
        {element ?? "card"}
      </span>
      <b className={cardTileTitleClass}>{name}</b>
      {cost != null && kind ? (
        <small className={cardTileMetaClass}>
          {cost} · {kind}
        </small>
      ) : null}
    </div>
  );
}
