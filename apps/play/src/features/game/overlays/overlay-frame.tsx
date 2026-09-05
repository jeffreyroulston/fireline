"use client";

import type { ReactNode } from "react";

import { cn } from "../ui/cn";

export type OverlayTone = "reserve" | "discard";

const toneRule: Record<OverlayTone, string> = {
  reserve: "bg-primary",
  discard: "bg-accent",
};

const toneEdge: Record<OverlayTone, string> = {
  reserve: "border-primary/45",
  discard: "border-accent/45",
};

export const overlayButtonClass =
  "inline-flex min-h-[38px] items-center justify-center rounded-sm border px-4 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45";

export const overlayPrimaryButtonClass = cn(
  overlayButtonClass,
  "border-primary bg-primary text-white hover:enabled:bg-primary-dark hover:enabled:border-primary-dark",
);

export const overlaySecondaryButtonClass = cn(
  overlayButtonClass,
  "border-border bg-surface text-foreground hover:enabled:border-foreground",
);

/**
 * Shared chrome for the payment prompts: a scrim over the board with a panel
 * banded across the hand, so the cards being spent stay where the player last
 * saw them.
 */
export function OverlayFrame({
  tone,
  eyebrow,
  headingId,
  meta,
  instruction,
  children,
  footer,
}: {
  tone: OverlayTone;
  eyebrow: string;
  headingId: string;
  meta?: ReactNode;
  instruction: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-foreground/25 px-4 pb-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        className={cn(
          "w-full max-w-5xl overflow-hidden rounded-sm border bg-surface shadow-[0_18px_40px_-24px_rgba(16,42,48,0.75)]",
          toneEdge[tone],
        )}
      >
        <div className={cn("h-[3px] w-full", toneRule[tone])} />
        <div className="px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2
              id={headingId}
              className="m-0 font-mono text-[10px] tracking-[0.22em] text-muted uppercase"
            >
              {eyebrow}
            </h2>
            {meta ? (
              <span className="font-mono text-[11px] tracking-[0.08em] text-foreground">
                {meta}
              </span>
            ) : null}
          </div>
          <p className="m-0 mb-3 font-mono text-[11px] leading-snug tracking-[0.04em] text-muted">
            {instruction}
          </p>
          {children}
          <div className="mt-3 flex flex-wrap gap-2">{footer}</div>
        </div>
      </div>
    </div>
  );
}

/** Hand row shared by both overlays. Fixed-width tiles so a big hand wraps. */
export function OverlayHandRow({ children }: { children: ReactNode }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{children}</ul>
  );
}

export function OverlayHandSlot({ children }: { children: ReactNode }) {
  return <li className="w-[84px] shrink-0">{children}</li>;
}
