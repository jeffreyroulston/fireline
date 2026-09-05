"use client";

import {
  CARDS,
  cardDisplayName,
  cardImageUrl,
  type CardId,
  type MaterialId,
} from "@ga-fire/game";

import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileFallbackInnerClass,
  cardTileImageClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileShellClass,
  cardTileTitleClass,
} from "./card-classes";
import { cn } from "./cn";

export type CardTileProps = {
  id: CardId | MaterialId | string;
  selected?: boolean;
  disabled?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
  className?: string;
  /** Accessible label override; defaults to the card name. */
  title?: string;
};

export function CardTile({
  id,
  selected = false,
  disabled = false,
  highlighted = false,
  onClick,
  className,
  title,
}: CardTileProps) {
  const card = CARDS[id];
  const name = card?.name ?? cardDisplayName(id);
  const src = cardImageUrl(id);
  const isFire = card?.element === "fire";

  const face = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art; no next/image domain config
    <img className={cardTileImageClass} src={src} alt={name} loading="lazy" />
  ) : (
    <div className={cn(cardTileClass(isFire), cardTileFallbackInnerClass)}>
      <span className={cardTileAccentClassFor(isFire)} aria-hidden />
      <span className={cn(cardTileLabelClass, isFire && "text-primary-dark")}>
        {isFire ? "FIRE" : (card?.element?.toUpperCase() ?? "CARD")}
      </span>
      <b className={cardTileTitleClass}>{name}</b>
      <small className={cardTileMetaClass}>
        {card?.cost ?? "?"}R · {card?.kind ?? "card"}
      </small>
    </div>
  );

  const shellClass = cn(
    cardTileShellClass,
    onClick && !disabled && "cursor-pointer group",
    disabled && "cursor-not-allowed opacity-45 grayscale-[35%]",
    selected &&
      "ring-2 ring-accent ring-offset-2 ring-offset-surface rounded-sm",
    highlighted &&
      !selected &&
      "ring-2 ring-primary/70 ring-offset-1 ring-offset-surface rounded-sm",
    className,
  );

  const label = title ?? name;

  if (onClick) {
    return (
      <button
        type="button"
        className={shellClass}
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-pressed={selected}
        aria-disabled={disabled}
      >
        {face}
      </button>
    );
  }

  return (
    <div className={shellClass} title={label} aria-disabled={disabled || undefined}>
      {face}
    </div>
  );
}
