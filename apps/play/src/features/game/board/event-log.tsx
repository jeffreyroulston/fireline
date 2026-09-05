"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CARDS } from "@ga-fire/game";
import type { LineEvent } from "@ga-fire/contracts";

import { cn } from "../ui/cn";

function cardName(id: string | null | undefined): string {
  if (!id) return "";
  return CARDS[id]?.name ?? id.replaceAll("_", " ");
}

function formatEvent(event: LineEvent): string {
  const parts: string[] = [];
  if (event.card) {
    parts.push(cardName(event.card));
  } else if (event.drawn) {
    parts.push(`Draw ${cardName(event.drawn)}`);
  } else if (event.discarded) {
    parts.push(`Discard ${cardName(event.discarded)}`);
  } else if (event.weapon) {
    parts.push(cardName(event.weapon));
  } else {
    parts.push(event.kind.replace(/([A-Z])/g, " $1").trim());
  }
  if (event.kind !== "start") {
    parts.push(`${event.damage} dmg`);
  }
  return parts.join(" · ");
}

export type EventLogProps = {
  events: readonly LineEvent[];
  className?: string;
  /** Start open (e.g. terminal screen). */
  defaultOpen?: boolean;
};

export function EventLog({
  events,
  className,
  defaultOpen = false,
}: EventLogProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const latest = events[events.length - 1];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = panelRef.current?.querySelector("[data-event-list]");
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [open, events.length]);

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-30", className)}>
      <button
        type="button"
        className={cn(
          "pointer-events-auto absolute top-3 right-3 flex max-w-[min(280px,calc(100%-1.5rem))] items-center gap-2 rounded-md border border-white/30 bg-black/80 px-3 py-2 text-left text-white shadow-sm transition hover:border-white/50",
          open && "border-accent/50 ring-1 ring-accent/30",
        )}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="font-display text-sm leading-none tracking-wide">
          Action log
        </span>
        <span className="rounded-full border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/80">
          {events.length}
        </span>
        {latest && !open ? (
          <span className="truncate font-mono text-[10px] text-white/55">
            {formatEvent(latest)}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 cursor-default bg-foreground/20"
            aria-label="Close action log"
            onClick={() => setOpen(false)}
          />
          <aside
            ref={panelRef}
            id={panelId}
            className="pointer-events-auto absolute top-14 right-3 bottom-3 flex w-[min(320px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-lg"
            aria-label="Action log"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-3 py-2">
              <div>
                <h2 className="font-display text-lg leading-none tracking-wide">
                  Action log
                </h2>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted">
                  {events.length} {events.length === 1 ? "event" : "events"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted hover:bg-surface-muted hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </header>
            <ol
              data-event-list
              className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0"
            >
              {events.length === 0 ? (
                <li className="px-3 py-4 font-mono text-xs text-muted">
                  No actions yet.
                </li>
              ) : (
                events.map((event, index) => (
                  <li
                    key={`${event.actionIndex}-${index}`}
                    className="border-b border-border/60 px-3 py-2 text-[12px] leading-snug last:border-b-0"
                  >
                    <span className="font-mono text-[9px] uppercase tracking-wide text-muted">
                      T{event.turn + 1} · {event.phase}
                    </span>
                    <p className="m-0 mt-0.5 text-foreground">
                      {formatEvent(event)}
                    </p>
                  </li>
                ))
              )}
            </ol>
          </aside>
        </>
      ) : null}
    </div>
  );
}
