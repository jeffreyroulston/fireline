"use client";

import { useCallback, useRef, useState } from "react";

import type { IndexedActionOption } from "@ga-fire/game";

import { cn } from "../ui/cn";
import { VariantMenu } from "./variant-menu";

export type AllyRowActionProps = {
  options: readonly IndexedActionOption[];
  onSelect: (option: IndexedActionOption) => void;
};

export function AllyRowAction({ options, onSelect }: AllyRowActionProps) {
  const shellRef = useRef<HTMLButtonElement>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const playable = options.length > 0;

  const activate = useCallback(() => {
    if (!playable) return;
    if (options.length === 1) {
      onSelect(options[0]!);
      return;
    }
    setMenuRect(shellRef.current?.getBoundingClientRect() ?? null);
  }, [onSelect, options, playable]);

  if (!playable) {
    return null;
  }

  return (
    <>
      <button
        ref={shellRef}
        type="button"
        onClick={activate}
        className={cn(
          "w-full rounded-md border px-3 py-2 text-left font-mono text-[12px] tracking-wide",
          "border-white/30 bg-white/5 text-white/85 hover:bg-white/10",
        )}
      >
        Ally row · {options.length} action{options.length === 1 ? "" : "s"}
      </button>
      {menuRect != null && options.length > 1 ? (
        <VariantMenu
          options={options}
          anchorRect={menuRect}
          onSelect={(entry) => {
            setMenuRect(null);
            onSelect(entry);
          }}
          onClose={() => setMenuRect(null)}
        />
      ) : null}
    </>
  );
}
