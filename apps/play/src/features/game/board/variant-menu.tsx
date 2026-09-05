"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { IndexedActionOption } from "@ga-fire/game";

import { cn } from "../ui/cn";

export type VariantMenuProps = {
  options: readonly IndexedActionOption[];
  anchorRect: DOMRect | null;
  onSelect: (option: IndexedActionOption) => void;
  onClose: () => void;
};

export function VariantMenu({
  options,
  anchorRect,
  onSelect,
  onClose,
}: VariantMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined" || anchorRect == null) {
    return null;
  }

  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 8);
  const left = Math.min(anchorRect.left, window.innerWidth - 280);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        "fixed z-50 min-w-[220px] max-w-[min(92vw,320px)] rounded-sm border border-border bg-surface py-1 shadow-lg",
      )}
      style={{ top, left }}
    >
      <p className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-wide text-muted">
        Choose action
      </p>
      <ul className="m-0 max-h-[min(40vh,280px)] list-none overflow-y-auto p-0">
        {options.map((entry) => (
          <li key={entry.optionIndex}>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-[13px] leading-snug transition-colors hover:bg-surface-deep"
              onClick={() => onSelect(entry)}
            >
              {entry.label}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}
