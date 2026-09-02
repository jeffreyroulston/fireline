"use client";

import type { CardId, LineEvent } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
import {
  consumePlayedSlots,
  playCountsFromEvents,
} from "../lib/played-hand-slots";
import { HandCard } from "./hand-card";
import { SectionHeading } from "./section-heading";

function openingDrawId(events: LineEvent[]): CardId | null {
  const start = events.find((event) => event.kind === "start");
  return start?.drawn ? (start.drawn as CardId) : null;
}

function drawnCardIds(events: LineEvent[]): CardId[] {
  return events.flatMap((event) =>
    event.drawn ? [event.drawn as CardId] : [],
  );
}

function handStripClass(count: number): string {
  return cn(
    "pointer-events-none grid min-h-0 gap-2",
    count >= 8 ? "grid-cols-8" : "grid-cols-7",
  );
}

export function LineHandStrips({
  openingHand,
  events,
  className,
}: {
  openingHand: CardId[];
  events: LineEvent[];
  className?: string;
}) {
  const openingDraw = openingDrawId(events);
  const displayedHand =
    openingDraw != null ? [...openingHand, openingDraw] : openingHand;
  const drawn = drawnCardIds(events);
  const remainingPlays = playCountsFromEvents(events);
  const handPlayed = consumePlayedSlots(displayedHand, remainingPlays);
  const drawnPlayed = consumePlayedSlots(drawn, remainingPlays);

  return (
    <div className={cn("mb-4", className)}>
      <div
        className={handStripClass(displayedHand.length)}
        aria-label="Opening hand"
      >
        {displayedHand.map((id, index) => (
          <HandCard
            key={`${id}-${index}`}
            id={id}
            faded={!handPlayed[index]}
          />
        ))}
      </div>
      {drawn.length > 0 ? (
        <div className="mt-3">
          <SectionHeading
            className="mb-2.5"
            title="DRAWN"
            meta={<strong>{drawn.length} cards</strong>}
          />
          <div
            className={handStripClass(drawn.length)}
            aria-label="Cards drawn on the line"
          >
            {drawn.map((id, index) => (
              <HandCard
                key={`drawn-${id}-${index}`}
                id={id}
                faded={!drawnPlayed[index]}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
