import type { CardId, MaterialId } from "@/lib/engine/types";
import { SectionHeading } from "../../ui";
import { DeckCardFace } from "./card-face";
import { tallyCards } from "./shared";

export function MainDeckCardGrid({ cards }: { cards: CardId[] }) {
  const entries = tallyCards(cards);
  if (entries.length === 0) return null;

  return (
    <div className="mt-[18px] border border-border bg-white p-[18px]">
      <SectionHeading
        title="CARD LIST"
        meta={<strong>{entries.length} unique</strong>}
        className="mb-3.5"
      />
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-x-3 gap-y-0"
        aria-label="Deck card images"
      >
        {entries.map(({ id, qty }) => (
          <DeckCardFace key={id} id={id} qty={qty} />
        ))}
      </div>
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
