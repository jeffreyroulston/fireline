import type { LineEvent } from "@ga-fire/contracts";
import { CARD_LIST } from "@/lib/engine";
import type { StepDiffInfo } from "../types";
import { formatLineEvent } from "./format-line-event";
import { compareMaterialLines } from "./material-line-diff";
import { twoPassEventDiff } from "./two-pass-event-diff";

export function mergeStepDiffWithMaterialMarks(
  stepDiff: StepDiffInfo[],
  materialMarks: boolean[],
): StepDiffInfo[] {
  return stepDiff.map((entry, index) => {
    if (!materialMarks[index]) {
      return { mark: "same" };
    }
    return entry;
  });
}

export function firstMaterialDivergence(
  yours: LineEvent[],
  optimal: LineEvent[],
  leftDamage?: number,
  rightDamage?: number,
): { index: number; summary: string } | null {
  const material = compareMaterialLines(
    yours,
    optimal,
    leftDamage,
    rightDamage,
  );
  if (material.equivalent) {
    return null;
  }

  const yoursIndex = material.marks.left.findIndex(Boolean);
  if (yoursIndex >= 0) {
    const yoursEvent = yours[yoursIndex];
    if (yoursEvent) {
      return {
        index: yoursIndex,
        summary: formatLineEvent(yoursEvent, CARD_LIST),
      };
    }
  }

  const optimalIndex = material.marks.right.findIndex(Boolean);
  if (optimalIndex >= 0) {
    const optimalEvent = optimal[optimalIndex];
    if (optimalEvent) {
      return {
        index: optimalIndex,
        summary: formatLineEvent(optimalEvent, CARD_LIST),
      };
    }
  }

  return null;
}

export function firstLineDivergence(
  yours: LineEvent[],
  optimal: LineEvent[],
  leftDamage?: number,
  rightDamage?: number,
): { index: number; summary: string } | null {
  const material = firstMaterialDivergence(
    yours,
    optimal,
    leftDamage,
    rightDamage,
  );
  if (material) {
    return material;
  }

  const materialComparison = compareMaterialLines(
    yours,
    optimal,
    leftDamage,
    rightDamage,
  );
  if (materialComparison.equivalent) {
    return null;
  }

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

export function countMaterialDiffs(marks: boolean[]): number {
  return marks.filter(Boolean).length;
}
