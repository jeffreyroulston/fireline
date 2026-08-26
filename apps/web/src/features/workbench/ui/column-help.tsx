"use client";

import type { ReactNode } from "react";

export function ColumnHelp({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="column-help">
      <span className="column-help-label">{label}</span>
      <button
        type="button"
        className="column-help-trigger"
        aria-label={`About ${label}`}
      >
        <span aria-hidden>i</span>
        <span className="column-help-popover" role="tooltip">
          {children}
        </span>
      </button>
    </span>
  );
}
