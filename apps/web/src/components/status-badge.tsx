"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { statusBadgeTone, statusBadgeVariants } from "@/lib/utils/variants";

const tooltipClass =
  "pointer-events-none invisible absolute top-[calc(100%+8px)] left-1/2 z-30 w-max max-w-[min(320px,90vw)] -translate-x-1/2 translate-y-[-4px] border border-border bg-surface px-2.5 py-2 text-left font-sans text-[11px] font-normal tracking-normal normal-case text-foreground opacity-0 shadow-[0_8px_24px_rgba(16,42,48,0.12)] transition-[opacity,transform,visibility] duration-[120ms] ease-in-out group-hover/status:visible group-hover/status:translate-y-0 group-hover/status:opacity-100 group-focus-visible/status:visible group-focus-visible/status:translate-y-0 group-focus-visible/status:opacity-100 group-aria-expanded/status:visible group-aria-expanded/status:translate-y-0 group-aria-expanded/status:opacity-100";

export function StatusBadge({
  status,
  errorMessage,
  className,
}: {
  status: string;
  errorMessage?: string | null;
  className?: string;
}) {
  const badgeClass = cn(
    statusBadgeVariants({ tone: statusBadgeTone(status) }),
    className,
  );
  const [open, setOpen] = useState(false);

  if (!errorMessage) {
    return <span className={badgeClass}>{status}</span>;
  }

  return (
    <button
      type="button"
      className={cn(badgeClass, "group/status cursor-help")}
      aria-expanded={open}
      aria-label={`${status}: ${errorMessage}`}
      onClick={() => setOpen((current) => !current)}
      onBlur={() => setOpen(false)}
    >
      {status}
      <span className={tooltipClass} role="tooltip">
        {errorMessage}
      </span>
    </button>
  );
}
