"use client";

import type { ReactNode } from "react";

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
    <span className={["info-popover", className].filter(Boolean).join(" ")}>
      {!hideLabel ? (
        <span className="info-popover-label">{label}</span>
      ) : null}
      <button
        type="button"
        className="info-popover-trigger"
        aria-label={`About ${label}`}
      >
        <span aria-hidden>i</span>
        <span className="info-popover-content" role="tooltip">
          {children}
        </span>
      </button>
    </span>
  );
}
