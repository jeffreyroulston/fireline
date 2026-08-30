import { CARDS, type CardId } from "@/lib/engine";
import { cardImageUrl } from "@/lib/card-images";
import { cn } from "@/lib/utils/cn";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
  handCardClass,
  handCardFallbackInnerClass,
  handCardImageClass,
} from "@/lib/utils/card-classes";

export function HandCard({
  id,
  onClick,
  faded = false,
}: {
  id: CardId;
  onClick?: () => void;
  /** Dim cards that were not played on the evaluated line. */
  faded?: boolean;
}) {
  const card = CARDS[id];
  const name = card?.name ?? id;
  const src = cardImageUrl(id);
  const isFire = card?.element === "fire";
  const face = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art; no next/image domain config
    <img className={handCardImageClass} src={src} alt={name} loading="lazy" />
  ) : (
    <div
      className={cn(
        cardTileClass(isFire),
        handCardFallbackInnerClass,
      )}
    >
      <span className={cardTileAccentClassFor(isFire)} aria-hidden />
      <span className={cn(cardTileLabelClass, isFire && "text-primary-dark")}>
        {isFire ? "FIRE" : "NORM"}
      </span>
      <b className={cardTileTitleClass}>{name}</b>
      <small className={cardTileMetaClass}>
        {card?.cost ?? "?"}R · {card?.kind ?? "card"}
      </small>
    </div>
  );

  const shellClass = cn(
    handCardClass,
    faded && "opacity-45 grayscale-[35%] [&_img]:border-foreground/10",
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(shellClass, "group")}
        onClick={onClick}
        title={`Remove ${name}`}
      >
        {face}
      </button>
    );
  }

  return (
    <div
      className={shellClass}
      title={faded ? `${name} (unplayed)` : undefined}
    >
      {face}
    </div>
  );
}
