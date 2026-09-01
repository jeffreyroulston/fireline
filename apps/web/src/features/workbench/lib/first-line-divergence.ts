import type { LineEvent } from "@ga-fire/contracts";
import { CARD_LIST } from "@/lib/engine";
import { formatLineEvent } from "./format-line-event";
import { twoPassEventDiff } from "./two-pass-event-diff";

export function firstLineDivergence(
  yours: LineEvent[],
  optimal: LineEvent[],
): { index: number; summary: string } | null {
  const diff = twoPassEventDiff(yours, optimal);
  const addedIndex = diff.oracle.findIndex(
    (entry) => entry.mark === "added" && entry.compareEvent,
  );
  if (addedIndex >= 0) {
    const yoursEvent = diff.oracle[addedIndex]?.compareEvent;
    const optimalEvent = optimal[addedIndex];
    if (yoursEvent && optimalEvent) {
      return {
        index: addedIndex,
        summary: `${formatLineEvent(yoursEvent, CARD_LIST)} vs ${formatLineEvent(optimalEvent, CARD_LIST)}`,
      };
    }
  }
  const loneAdded = diff.oracle.findIndex((entry) => entry.mark === "added");
  if (loneAdded >= 0) {
    const optimalEvent = optimal[loneAdded];
    if (optimalEvent) {
      return {
        index: loneAdded,
        summary: formatLineEvent(optimalEvent, CARD_LIST),
      };
    }
  }
  const loneRemoved = diff.brick.findIndex((entry) => entry.mark === "removed");
  if (loneRemoved >= 0) {
    const yoursEvent = yours[loneRemoved];
    if (yoursEvent) {
      return {
        index: loneRemoved,
        summary: formatLineEvent(yoursEvent, CARD_LIST),
      };
    }
  }
  return null;
}
