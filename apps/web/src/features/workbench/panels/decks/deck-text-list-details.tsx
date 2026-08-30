"use client";

import { cn } from "@/lib/utils/cn";

const deckTextareaClass =
  "min-h-[310px] resize-y p-4 font-mono text-xs leading-[1.8] normal-case read-only:cursor-default read-only:opacity-85";

const textListDetailsClass = cn(
  "mt-[18px] border border-border bg-white",
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
}: {
  deckText: string;
  onDeckTextChange?: (text: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <details className={cn(textListDetailsClass, className)}>
      <summary>
        <span>{readOnly ? "View as text" : "Edit as text"}</span>
      </summary>
      <label className="mx-3.5 mb-3.5 grid gap-[7px]">
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
