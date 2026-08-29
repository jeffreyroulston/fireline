"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CardDef } from "@/lib/engine/types";
import { cn } from "@/lib/utils/cn";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
} from "@/lib/utils/card-classes";
import {
  CARD_PREVIEW_MARGIN,
  CARD_PREVIEW_WIDTH,
  cardTraitLines,
  clampPreviewPosition,
} from "./shared";

const deckCardImageClass =
  "block aspect-[5/7] w-full border border-foreground/20 bg-foreground/[0.04] object-cover";

export function DeckCardPreview({
  card,
  qty,
  src,
  anchor,
  onClose,
}: {
  card: CardDef;
  qty: number;
  src: string | null;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    width: CARD_PREVIEW_WIDTH,
    maxHeight: `calc(100vh - ${CARD_PREVIEW_MARGIN * 2}px)`,
    visibility: "hidden",
  });

  function placePreview() {
    const node = previewRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    const { top, left } = clampPreviewPosition(
      anchor,
      width || CARD_PREVIEW_WIDTH,
      height || 1,
    );
    setStyle({
      position: "fixed",
      top,
      left,
      width: CARD_PREVIEW_WIDTH,
      maxHeight: `calc(100vh - ${CARD_PREVIEW_MARGIN * 2}px)`,
      visibility: "visible",
    });
  }

  useLayoutEffect(() => {
    placePreview();
  }, [anchor]);

  useEffect(() => {
    function reposition() {
      placePreview();
    }
    function hide() {
      onClose();
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", hide, true);
    };
  }, [anchor, onClose]);

  const traits = cardTraitLines(card);
  const combat =
    card.power != null || card.life != null
      ? `${card.power ?? "—"} power / ${card.life ?? "—"} life`
      : null;
  const isFire = card.element === "fire";

  return (
    <div
      ref={previewRef}
      className="z-[80] grid gap-[13px] overflow-auto border border-border bg-white p-4 shadow-[0_12px_32px_rgba(16,42,48,0.18)] pointer-events-none"
      role="tooltip"
      style={style}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art
        <img src={src} alt="" onLoad={placePreview} className={deckCardImageClass} />
      ) : (
        <div
          className={cn(
            cardTileClass(isFire),
            "min-h-0 w-full",
          )}
        >
          <span className={cardTileAccentClassFor(isFire)} aria-hidden />
          <span className={cn(cardTileLabelClass, isFire && "text-primary-dark")}>
            {card.element}
          </span>
          <b className={cardTileTitleClass}>{card.name}</b>
          <small className={cardTileMetaClass}>
            {card.cost} · {card.kind}
          </small>
        </div>
      )}
      <div className="grid min-w-0 gap-[5px]">
        <p className="m-0 font-display text-[29px] leading-none font-bold text-foreground">
          {qty}×
        </p>
        <h3 className="m-0 font-display text-[26px] leading-[1.15] font-semibold">
          {card.name}
        </h3>
        <p className="m-0 text-base leading-[1.4] text-muted capitalize">
          {card.kind} · {card.element} · cost {card.cost}
        </p>
        {combat && (
          <p className="m-0 text-base leading-[1.4] text-muted capitalize">
            {combat}
          </p>
        )}
        {traits.length > 0 && (
          <ul className="mt-[5px] list-none p-0">
            {traits.map((trait) => (
              <li
                key={trait}
                className="text-base leading-[1.4] text-foreground not-first:mt-[3px]"
              >
                {trait}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
