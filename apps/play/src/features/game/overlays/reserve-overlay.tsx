"use client";

import { useId } from "react";

import type { SessionReservePrompt } from "@ga-fire/game";

import { CardTile } from "../ui";
import {
  OverlayFrame,
  OverlayHandRow,
  OverlayHandSlot,
  overlayPrimaryButtonClass,
  overlaySecondaryButtonClass,
} from "./overlay-frame";
import { canConfirmReserve, reserveSlotStates } from "./payment-rules";

export type ReserveOverlayProps = {
  prompt: SessionReservePrompt;
  busy?: boolean;
  onToggle: (handIndex: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ReserveOverlay({
  prompt,
  busy = false,
  onToggle,
  onConfirm,
  onCancel,
}: ReserveOverlayProps) {
  const headingId = useId();
  const slots = reserveSlotStates(prompt);
  const ready = canConfirmReserve(prompt);

  return (
    <OverlayFrame
      tone="reserve"
      eyebrow="Reserve payment"
      headingId={headingId}
      meta={
        <>
          <strong>{prompt.selected.length}</strong>
          <span className="text-muted">/{prompt.reserveCount}</span>
        </>
      }
      instruction={
        <>
          {prompt.label}
          {prompt.fireOnly ? " · Fire cards only" : ""}
        </>
      }
      footer={
        <>
          <button
            type="button"
            className={overlayPrimaryButtonClass}
            onClick={onConfirm}
            disabled={busy || !ready}
          >
            Confirm reserve
          </button>
          <button
            type="button"
            className={overlaySecondaryButtonClass}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </>
      }
    >
      <OverlayHandRow>
        {slots.map((slot) => (
          <OverlayHandSlot key={`reserve-${slot.cardId}-${slot.index}`}>
            <CardTile
              id={slot.cardId}
              selected={slot.selected}
              disabled={busy || !slot.selectable}
              title={slot.reason}
              onClick={() => onToggle(slot.index)}
            />
          </OverlayHandSlot>
        ))}
      </OverlayHandRow>
    </OverlayFrame>
  );
}
