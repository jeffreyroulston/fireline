"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const triggerClass =
  "group relative grid h-3.5 w-3.5 place-items-center rounded-full border border-[color-mix(in_srgb,var(--color-border)_85%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] p-0 font-sans text-[9px] font-semibold italic leading-none text-muted normal-case hover:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-border))] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,white)] hover:text-[color-mix(in_srgb,var(--color-accent)_75%,var(--color-foreground))] focus-visible:border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-border))] focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_10%,white)] focus-visible:text-[color-mix(in_srgb,var(--color-accent)_75%,var(--color-foreground))]";

const contentClass =
  "pointer-events-none invisible absolute top-[calc(100%+8px)] left-1/2 z-20 w-max max-w-[min(320px,90vw)] -translate-x-1/2 -translate-y-1 border border-border bg-surface px-2.5 py-2 text-left font-sans text-[11px] font-normal tracking-normal normal-case text-foreground opacity-0 shadow-[0_8px_24px_rgba(16,42,48,0.12)] transition-[opacity,transform,visibility] duration-[120ms] ease-in-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-y-0 group-focus-visible:opacity-100";

export function InfoPopover({
  label,
  children,
  hideLabel = false,
  className,
}: {
  label: string;
  children: ReactNode;
  hideLabel?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[5px]", className)}>
      {!hideLabel ? <span className="leading-none">{label}</span> : null}
      <button type="button" className={triggerClass} aria-label={`About ${label}`}>
        <span aria-hidden>i</span>
        <span className={contentClass} role="tooltip">
          {children}
        </span>
      </button>
    </span>
  );
}
