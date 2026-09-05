"use client";

import { useId } from "react";

import type { SessionDiscardPrompt } from "@ga-fire/game";

import { CardTile } from "../ui";
import { cn } from "../ui/cn";
import {
  OverlayFrame,
  OverlayHandRow,
  OverlayHandSlot,
  overlaySecondaryButtonClass,
} from "./overlay-frame";
import { discardSlotStates, discardStepLabel } from "./payment-rules";

export type DiscardOverlayProps = {
  prompt: SessionDiscardPrompt;
  busy?: boolean;
  onChoose: (handIndex: number) => void;
  onSkip: () => void;
  onCancel: () => void;
};

/** One pip per attacking ally: settled steps, the open one, then the rest. */
function StepProgress({ prompt }: { prompt: SessionDiscardPrompt }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: prompt.stepCount }, (_, step) => (
        <span
          key={step}
          className={cn(
            "h-[3px] w-4 rounded-full",
            step < prompt.stepIndex && "bg-accent",
            step === prompt.stepIndex && "bg-foreground",
            step > prompt.stepIndex && "bg-border",
          )}
        />
      ))}
    </span>
  );
}

export function DiscardOverlay({
  prompt,
  busy = false,
  onChoose,
  onSkip,
  onCancel,
}: DiscardOverlayProps) {
  const headingId = useId();
  const slots = discardSlotStates(prompt);
  const multiStep = prompt.stepCount > 1;

  return (
    <OverlayFrame
      tone="discard"
      eyebrow="Discard"
      headingId={headingId}
      meta={
        multiStep ? (
          <span className="flex items-center gap-2">
            <StepProgress prompt={prompt} />
            <span>
              <strong>{prompt.stepIndex + 1}</strong>
              <span className="text-muted">/{prompt.stepCount}</span>
            </span>
          </span>
        ) : undefined
      }
      instruction={
        <>
          {discardStepLabel(prompt)}
          {prompt.optional ? " · Optional" : ""}
        </>
      }
      footer={
        <>
          {/* A mandatory discard offers no way out but cancelling the action. */}
          {prompt.optional ? (
            <button
              type="button"
              className={overlaySecondaryButtonClass}
              onClick={onSkip}
              disabled={busy}
            >
              Skip discard
            </button>
          ) : null}
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
          <OverlayHandSlot key={`discard-${slot.cardId}-${slot.index}`}>
            <div className="relative">
              <CardTile
                id={slot.cardId}
                disabled={busy || !slot.selectable}
                highlighted={slot.drawn}
                title={slot.reason}
                onClick={() => onChoose(slot.index)}
              />
              {slot.drawn ? (
                <span className="pointer-events-none absolute top-1 right-1 bg-secondary px-1 font-mono text-[8px] tracking-[0.1em] text-white uppercase">
                  Drawn
                </span>
              ) : null}
            </div>
          </OverlayHandSlot>
        ))}
      </OverlayHandRow>
    </OverlayFrame>
  );
}
