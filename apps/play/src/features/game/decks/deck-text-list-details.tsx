"use client";

import { cn } from "../ui/cn";

const deckTextareaClass =
  "min-h-[310px] w-full resize-y rounded-md border border-border bg-surface p-4 font-mono text-xs leading-[1.8] text-foreground outline-none focus-visible:border-accent read-only:cursor-default read-only:opacity-85";

const textListDetailsClass = cn(
  "mt-[18px] rounded-xl border border-border bg-surface",
  "[&>summary]:flex [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-baseline [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:px-3.5 [&>summary]:py-3",
  "[&>summary::-webkit-details-marker]:hidden",
  "[&>summary_span]:font-mono [&>summary_span]:text-[11px] [&>summary_span]:tracking-[0.08em] [&>summary_span]:text-foreground [&>summary_span]:uppercase",
  "[&>summary::after]:font-mono [&>summary::after]:text-muted [&>summary::after]:content-['+']",
  "[&[open]>summary::after]:content-['−']",
);

export function DeckTextListDetails({
  deckText,
  onDeckTextChange,
  readOnly = false,
  className,
  summaryLabel,
}: {
  deckText: string;
  onDeckTextChange?: (text: string) => void;
  readOnly?: boolean;
  className?: string;
  summaryLabel?: string;
}) {
  return (
    <details className={cn(textListDetailsClass, className)}>
      <summary>
        <span>
          {summaryLabel ?? (readOnly ? "View as text" : "Edit as text")}
        </span>
      </summary>
      <label className="mx-3.5 mb-3.5 grid gap-[7px] text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        One card per line, with quantity
        <textarea
          className={deckTextareaClass}
          value={deckText}
          readOnly={readOnly}
          onChange={
            readOnly || !onDeckTextChange
              ? undefined
              : (event) => onDeckTextChange(event.target.value)
          }
          spellCheck={false}
        />
      </label>
    </details>
  );
}
