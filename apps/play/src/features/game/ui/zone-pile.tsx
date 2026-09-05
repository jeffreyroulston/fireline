"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { CardId, MaterialId } from "@ga-fire/game";

import { CardTile } from "./card-tile";
import { cn } from "./cn";

export type ZoneKind = "deck" | "graveyard" | "banish" | "float";

export type ZonePileProps = {
  kind: ZoneKind;
  label: string;
  count: number;
  /** Card ids in zone order (top-first for gy/banish; deck order for deck). */
  cards: readonly (CardId | MaterialId | string)[];
  /** Portrait = vertical card slot; landscape = wide banished slot. */
  orientation?: "portrait" | "landscape";
  /** Compact slots for dual-sided playmat. */
  size?: "md" | "sm";
  /** Outline-only; no browse dialog (opponent placeholders). */
  inert?: boolean;
  className?: string;
  onActivate?: () => void;
  playable?: boolean;
};

const zoneAccent: Record<ZoneKind, string> = {
  deck: "border-white/55 bg-transparent",
  graveyard: "border-white/55 bg-transparent",
  banish: "border-white/55 bg-transparent",
  float: "border-white/55 bg-transparent",
};

export function ZonePile({
  kind,
  label,
  count,
  cards,
  orientation = "portrait",
  size: _size = "md",
  inert = false,
  className,
  onActivate,
  playable = false,
}: ZonePileProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const landscape = orientation === "landscape";
  const canBrowse =
    !inert && (cards.length > 0 || kind === "deck" || kind === "float");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const shellClass = cn(
    "relative flex flex-col items-center justify-center rounded-[2px] border px-1.5 py-1.5 text-center transition-[border-color,transform,background-color] duration-150 ease-in-out",
    // Match battlefield card footprint (112×157 portrait / 157×112 landscape).
    landscape ? "h-[112px] w-[157px]" : "h-[157px] w-[112px]",
    zoneAccent[kind],
    playable && "border-accent/70 bg-accent/15 hover:bg-accent/20",
    !playable && !inert && "hover:border-white/80 hover:bg-white/[0.03]",
    inert && "pointer-events-none select-none opacity-90",
    className,
  );

  const labelClass = cn(
    "relative z-[1] font-mono font-semibold uppercase leading-tight tracking-[0.1em] text-white/90",
    landscape ? "text-[9px]" : "max-w-[6rem] text-[9px]",
  );

  const body = (
    <>
      <span className={labelClass}>{label}</span>
      <span className="relative z-[1] mt-1.5 font-mono text-[14px] font-semibold tabular-nums text-white/80">
        {count}
      </span>
      {playable ? (
        <span className="relative z-[1] mt-1 font-mono text-[8px] uppercase tracking-wide text-accent">
          Play
        </span>
      ) : null}
    </>
  );

  return (
    <>
      {inert ? (
        <div className={shellClass} title={`${label}: ${count}`} aria-hidden>
          {body}
        </div>
      ) : (
        <button
          type="button"
          className={shellClass}
          onClick={() => {
            if (onActivate && playable) {
              onActivate();
              return;
            }
            if (canBrowse) {
              setOpen(true);
            }
          }}
          aria-haspopup={canBrowse ? "dialog" : undefined}
          aria-expanded={canBrowse ? open : undefined}
          title={`${label}: ${count}`}
        >
          {body}
        </button>
      )}

      {!inert &&
        typeof document !== "undefined" &&
        createPortal(
          <dialog
            ref={dialogRef}
            className="fixed inset-0 z-50 m-auto max-h-[min(85vh,720px)] w-[min(92vw,560px)] max-w-none rounded-md border border-border bg-surface p-0 shadow-xl backdrop:bg-foreground/35 open:flex open:flex-col"
            aria-labelledby={titleId}
            onCancel={() => setOpen(false)}
            onClose={() => setOpen(false)}
          >
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 id={titleId} className="font-display text-xl leading-none">
                {label}
              </h2>
              <span className="font-mono text-xs text-muted tabular-nums">
                {count} {count === 1 ? "card" : "cards"}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {cards.length === 0 ? (
                <p className="font-mono text-sm text-muted">
                  {kind === "float"
                    ? `${count} floating memory`
                    : kind === "deck"
                      ? `${count} cards remaining`
                      : "Empty."}
                </p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-3">
                  {cards.map((id, index) => (
                    <li key={`${id}-${index}`} className="min-w-0">
                      <CardTile id={id} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <footer className="border-t border-border px-4 py-3">
              <button
                type="button"
                className="rounded-sm border border-border bg-surface-deep px-3 py-1.5 font-display text-sm uppercase tracking-wide transition-colors hover:border-foreground"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </footer>
          </dialog>,
          document.body,
        )}
    </>
  );
}
