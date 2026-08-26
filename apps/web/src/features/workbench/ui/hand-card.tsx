import { CARDS, type CardId } from "@/lib/engine";
import { cardImageUrl } from "@/lib/card-images";

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
  const face = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art; no next/image domain config
    <img src={src} alt={name} loading="lazy" />
  ) : (
    <div
      className={`card-tile hand-card-fallback is-${card?.element ?? "norm"}`}
    >
      <span>{card?.element === "fire" ? "FIRE" : "NORM"}</span>
      <b>{name}</b>
      <small>
        {card?.cost ?? "?"}R · {card?.kind ?? "card"}
      </small>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="hand-card"
        onClick={onClick}
        title={`Remove ${name}`}
      >
        {face}
      </button>
    );
  }

  return <div className="hand-card">{face}</div>;
}
