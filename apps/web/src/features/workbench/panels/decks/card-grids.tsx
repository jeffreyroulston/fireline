import {
  MIN_VALID_DECK_SIZE,
  maxCopiesForCard,
  type CardId,
  type MaterialId,
} from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
import { SectionHeading } from "../../ui";
import { DeckCardFace } from "./card-face";
import { tallyCards } from "./shared";

export function MainDeckCardGrid({
  cards,
  editable = false,
  onAdd,
  onRemove,
}: {
  cards: CardId[];
  editable?: boolean;
  onAdd?: (id: CardId) => void;
  onRemove?: (id: CardId) => void;
}) {
  const entries = tallyCards(cards);
  if (entries.length === 0 && !editable) return null;

  const total = cards.length;
  const underSize = total < MIN_VALID_DECK_SIZE;
  const remaining = Math.max(0, MIN_VALID_DECK_SIZE - total);

  return (
    <div className="mt-[18px] border border-border bg-white p-[18px]">
      <div className="mb-3.5 flex items-end justify-between gap-4">
        <SectionHeading
          title={editable ? "VISUAL LIST" : "CARD LIST"}
          meta={<strong>{entries.length} unique</strong>}
          className="mb-0 min-w-0 flex-1"
        />
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "m-0 font-display text-[32px] leading-none font-bold tracking-[-0.03em] tabular-nums",
              underSize ? "text-primary-dark" : "text-foreground",
            )}
            aria-label={`${total} of ${MIN_VALID_DECK_SIZE} cards`}
          >
            {total}
            <span className="text-[18px] font-semibold text-muted">
              {" "}
              / {MIN_VALID_DECK_SIZE}
            </span>
          </p>
          <p
            className={cn(
              "m-0 mt-1 font-mono text-[10px] tracking-[0.06em] uppercase",
              underSize ? "text-primary-dark" : "text-muted",
            )}
          >
            {underSize ? `Need ${remaining} more` : "Deck size met"}
          </p>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">
          No recognized cards yet. Add from the catalog or paste a list above.
        </p>
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-x-3 gap-y-0"
          aria-label="Deck card images"
        >
          {entries.map(({ id, qty }) => (
            <DeckCardFace
              key={id}
              id={id}
              qty={qty}
              editable={editable}
              canAdd={editable && qty < maxCopiesForCard(id)}
              onAdd={editable && onAdd ? () => onAdd(id) : undefined}
              onRemove={editable && onRemove ? () => onRemove(id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MaterialDeckCardGrid({
  materialCards,
}: {
  materialCards: MaterialId[];
}) {
  return (
    <div className="mt-[18px] border border-border bg-white p-[18px]">
      <SectionHeading
        title="MATERIAL DECK"
        meta={<strong>{materialCards.length} cards</strong>}
        className="mb-3.5"
      />
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-x-3 gap-y-0"
        aria-label="Material deck card images"
      >
        {materialCards.map((id) => (
          <DeckCardFace key={id} id={id} qty={1} />
        ))}
      </div>
    </div>
  );
}
