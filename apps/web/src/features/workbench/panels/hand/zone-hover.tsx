"use client";

import { CARDS, type CardId } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { HandCard } from "../../ui";

const popoverClass = cn(
  "pointer-events-none invisible absolute top-[calc(100%+8px)] left-0 z-30 w-[min(320px,90vw)] border border-border bg-surface p-3 opacity-0 shadow-[0_8px_24px_rgba(16,42,48,0.12)] transition-[opacity,visibility] duration-[120ms] ease-in-out",
  "group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
);

function zoneCount(map: Record<string, number | undefined>): number {
  return Object.values(map).reduce<number>(
    (sum, count) => sum + (count ?? 0),
    0,
  );
}

function expandZoneMap(map: Record<string, number | undefined>): CardId[] {
  const out: CardId[] = [];
  const entries = Object.entries(map).sort(([leftId], [rightId]) => {
    const left = CARDS[leftId as CardId]?.name ?? leftId;
    const right = CARDS[rightId as CardId]?.name ?? rightId;
    return left.localeCompare(right);
  });
  for (const [id, count] of entries) {
    for (let index = 0; index < (count ?? 0); index += 1) {
      out.push(id as CardId);
    }
  }
  return out;
}

function ZonePopover({
  label,
  count,
  cards,
  extras = [],
}: {
  label: string;
  count: number;
  cards: CardId[];
  extras?: string[];
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="cursor-help border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] text-inherit underline decoration-dotted underline-offset-[3px] hover:text-foreground focus-visible:text-foreground"
        aria-label={`${label}: ${count} cards`}
      >
        {label} {count}
      </button>
      <span className={popoverClass} role="tooltip">
        <span className="mb-2 block font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
          {label}
        </span>
        {cards.length > 0 ? (
          <div className="grid grid-cols-7 gap-1.5">
            {cards.map((id, index) => (
              <HandCard key={`${label}-${id}-${index}`} id={id} />
            ))}
          </div>
        ) : extras.length === 0 ? (
          <p className="m-0 font-mono text-[11px] text-muted">Empty</p>
        ) : null}
        {extras.length > 0 ? (
          <ul
            className={cn(
              "m-0 list-none p-0 font-mono text-[11px] text-foreground",
              cards.length > 0 && "mt-2 border-t border-border pt-2",
            )}
          >
            {extras.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </span>
    </span>
  );
}

export function BoardZones({
  gy,
  banished,
  ringBanished,
  fireGy,
  queueRemaining,
}: {
  gy: Record<string, number | undefined>;
  banished: Record<string, number | undefined>;
  ringBanished: boolean;
  fireGy: number;
  queueRemaining: number;
}) {
  const gyCards = expandZoneMap(gy);
  const banishCards = expandZoneMap(banished);
  const banishExtras = ringBanished ? ["Grand Crusader's Ring"] : [];
  const banishCount = zoneCount(banished) + banishExtras.length;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tracking-[0.06em] text-muted">
      <ZonePopover label="Graveyard" count={zoneCount(gy)} cards={gyCards} />
      <span aria-hidden>·</span>
      <ZonePopover
        label="Banish"
        count={banishCount}
        cards={banishCards}
        extras={banishExtras}
      />
      <span aria-hidden>·</span>
      <span>
        FireGY {fireGy} · Queue {queueRemaining} left
      </span>
    </div>
  );
}
