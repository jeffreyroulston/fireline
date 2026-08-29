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
}: {
  id: CardId;
  onClick?: () => void;
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

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(handCardClass, "group")}
        onClick={onClick}
        title={`Remove ${name}`}
      >
        {face}
      </button>
    );
  }

  return <div className={handCardClass}>{face}</div>;
}
