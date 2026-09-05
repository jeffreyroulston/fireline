"use client";

import { useCallback, useRef, useState } from "react";

import type { IndexedActionOption } from "@ga-fire/game";

import { CardTile, type CardTileProps } from "../ui";
import { VariantMenu } from "./variant-menu";

export type TargetTileProps = Omit<CardTileProps, "onClick"> & {
  options: readonly IndexedActionOption[];
  onSelect: (option: IndexedActionOption) => void;
};

export function TargetTile({
  options,
  onSelect,
  disabled,
  highlighted,
  className,
  ...cardProps
}: TargetTileProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const playable = options.length > 0 && !disabled;

  const activate = useCallback(() => {
    if (!playable) return;
    if (options.length === 1) {
      onSelect(options[0]!);
      return;
    }
    setMenuRect(shellRef.current?.getBoundingClientRect() ?? null);
  }, [onSelect, options, playable]);

  return (
    <div ref={shellRef} className="relative min-w-0">
      <CardTile
        {...cardProps}
        disabled={disabled ?? !playable}
        highlighted={highlighted ?? playable}
        onClick={playable ? activate : undefined}
        className={className}
      />
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
    </div>
  );
}
