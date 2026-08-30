"use client";

import {
  CARD_LIST,
  isPlayableDeckCard,
  maxCopiesForCard,
  type CardId,
  type CardKind,
} from "@/lib/engine";
import { cardImageUrl } from "@/lib/card-images";
import { cn } from "@/lib/utils/cn";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
} from "@/lib/utils/card-classes";
import { useState } from "react";
import { SectionHeading } from "../../ui";
import { DeckTextListDetails } from "./deck-text-list-details";

const KIND_FILTERS: { id: "all" | CardKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ally", label: "Ally" },
  { id: "attack", label: "Attack" },
  { id: "action", label: "Action" },
  { id: "item", label: "Item" },
];

const filterButtonClass = (active: boolean) =>
  cn(
    "inline-flex h-8 items-center border px-2.5 font-mono text-[10px] tracking-[0.06em] uppercase",
    active
      ? "border-foreground bg-foreground text-white"
      : "border-border bg-white text-muted hover:border-foreground hover:text-foreground",
  );

const catalogCardClass =
  "group m-0 flex min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-accent/60 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45";

const catalogImageClass =
  "block aspect-[5/7] w-full border border-foreground/20 bg-foreground/[0.04] object-cover transition-[border-color,transform] duration-150 ease-in-out group-enabled:group-hover:-translate-y-[3px] group-enabled:group-hover:border-foreground";

export function DeckCardCatalog({
  counts,
  onAdd,
  deckText,
  onDeckTextChange,
}: {
  counts: Record<string, number>;
  onAdd: (id: CardId) => void;
  deckText: string;
  onDeckTextChange: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | CardKind>("all");

  const q = query.trim().toLowerCase();
  const cards = CARD_LIST.filter(isPlayableDeckCard)
    .filter((card) => (kind === "all" ? true : card.kind === kind))
    .filter((card) => {
      if (!q) return true;
      return (
        card.name.toLowerCase().includes(q) ||
        card.short.toLowerCase().includes(q) ||
        card.id.includes(q)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mt-[18px] border border-border bg-white p-[18px]">
      <SectionHeading
        title="ADD CARDS"
        meta={<strong>{cards.length} shown</strong>}
        className="mb-3.5"
      />
      <div className="mb-3.5 flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="min-w-[180px] flex-1">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or short code"
            spellCheck={false}
          />
        </label>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filter by card type"
        >
          {KIND_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={filterButtonClass(kind === filter.id)}
              aria-pressed={kind === filter.id}
              onClick={() => setKind(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-2.5 gap-y-3 overflow-y-auto pr-1"
        aria-label="Card catalog"
      >
        {cards.map((card) => {
          const qty = counts[card.id] ?? 0;
          const max = maxCopiesForCard(card.id);
          const atMax = qty >= max;
          const src = cardImageUrl(card.id);
          const isFire = card.element === "fire";

          return (
            <button
              key={card.id}
              type="button"
              className={catalogCardClass}
              disabled={atMax}
              onClick={() => onAdd(card.id)}
              title={
                atMax
                  ? `${card.name} is at max copies (${max})`
                  : `Add ${card.name} (${qty}/${max})`
              }
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className={catalogImageClass}
                />
              ) : (
                <div
                  className={cn(
                    cardTileClass(isFire),
                    "pointer-events-none aspect-[5/7] w-full min-h-0",
                  )}
                >
                  <span className={cardTileAccentClassFor(isFire)} aria-hidden />
                  <span
                    className={cn(cardTileLabelClass, isFire && "text-primary-dark")}
                  >
                    {card.element}
                  </span>
                  <b className={cardTileTitleClass}>{card.name}</b>
                  <small className={cardTileMetaClass}>
                    {card.cost} · {card.kind}
                  </small>
                </div>
              )}
              <span className="flex min-w-0 items-baseline justify-between gap-1">
                <span className="truncate font-display text-[11px] leading-[1.2] text-muted">
                  {card.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
                  {qty}/{max}
                </span>
              </span>
            </button>
          );
        })}
        {cards.length === 0 && (
          <p className="col-span-full m-0 text-[13px] text-muted">
            No cards match that filter.
          </p>
        )}
      </div>
      <DeckTextListDetails
        className="mt-3.5 border-border bg-surface"
        deckText={deckText}
        onDeckTextChange={onDeckTextChange}
      />
    </div>
  );
}
