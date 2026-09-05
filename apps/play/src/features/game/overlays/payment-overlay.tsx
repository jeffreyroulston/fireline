"use client";

import type { SessionPrompt } from "@ga-fire/game";

import { DiscardOverlay } from "./discard-overlay";
import { ReserveOverlay } from "./reserve-overlay";

/**
 * Single mount point for the payment prompts. The session opens at most one at
 * a time, and its callbacks map one-to-one onto `SessionEvent`, so the page can
 * wire this straight to `dispatch` without deciding anything itself.
 */
export type PaymentOverlayProps = {
  prompt: SessionPrompt | null;
  busy?: boolean;
  onToggleReserve: (handIndex: number) => void;
  onConfirmReserve: () => void;
  onChooseDiscard: (handIndex: number) => void;
  onSkipDiscard: () => void;
  onCancel: () => void;
};

export function PaymentOverlay({
  prompt,
  busy = false,
  onToggleReserve,
  onConfirmReserve,
  onChooseDiscard,
  onSkipDiscard,
  onCancel,
}: PaymentOverlayProps) {
  if (prompt == null) {
    return null;
  }

  if (prompt.kind === "reserve") {
    return (
      <ReserveOverlay
        prompt={prompt}
        busy={busy}
        onToggle={onToggleReserve}
        onConfirm={onConfirmReserve}
        onCancel={onCancel}
      />
    );
  }

  return (
    <DiscardOverlay
      prompt={prompt}
      busy={busy}
      onChoose={onChooseDiscard}
      onSkip={onSkipDiscard}
      onCancel={onCancel}
    />
  );
}
