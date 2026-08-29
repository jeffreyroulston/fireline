"use client";

import { cardImageUrl } from "@/lib/card-images";
import type { CardId, MaterialId } from "@/lib/engine/types";
import { cn } from "@/lib/utils/cn";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
} from "@/lib/utils/card-classes";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { DeckCardPreview } from "./card-preview";
import {
  CARD_PREVIEW_DELAY_MS,
  resolveDeckCard,
} from "./shared";

const deckCardImageClass =
  "block aspect-[5/7] w-full border border-foreground/20 bg-foreground/[0.04] object-cover";

export function DeckCardFace({ id, qty }: { id: CardId | MaterialId; qty: number }) {
  const card = resolveDeckCard(id);
  const src = cardImageUrl(id);
  const faceRef = useRef<HTMLElement>(null);
  const timerRef = useRef<number | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  const hidePreview = useCallback(() => {
    clearTimer();
    setAnchor(null);
  }, []);

  function showPreviewSoon() {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      const el = faceRef.current;
      if (!el) return;
      setAnchor(el.getBoundingClientRect());
    }, CARD_PREVIEW_DELAY_MS);
  }

  useEffect(() => () => clearTimer(), []);

  if (!card) return null;

  const isFire = card.element === "fire";

  return (
    <figure
      ref={faceRef}
      className="m-0 mb-3 flex min-w-0 flex-col gap-1 border-b border-border pb-3 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-accent/60 focus-visible:outline-offset-2"
      onMouseEnter={showPreviewSoon}
      onMouseLeave={hidePreview}
      onFocus={showPreviewSoon}
      onBlur={hidePreview}
      tabIndex={0}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote GATCG art
        <img src={src} alt={card.name} loading="lazy" className={deckCardImageClass} />
      ) : (
        <div
          className={cn(
            cardTileClass(isFire),
            "pointer-events-none aspect-[5/7] w-full min-h-0",
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
      <figcaption className="flex min-w-0 items-baseline gap-1.5">
        <span
          className="shrink-0 font-display text-base leading-none font-bold tracking-[-0.02em] text-foreground"
          aria-label={`Quantity ${qty}`}
        >
          {qty}
        </span>
        <span className="truncate font-display text-[11px] leading-[1.2] text-muted">
          {card.name}
        </span>
      </figcaption>
      {anchor &&
        createPortal(
          <DeckCardPreview
            card={card}
            qty={qty}
            src={src}
            anchor={anchor}
            onClose={hidePreview}
          />,
          document.body,
        )}
    </figure>
  );
}
