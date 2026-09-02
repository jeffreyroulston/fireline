"use client";

import type { CardId, LineEvent } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
import {
  countMaterialDiffs,
  firstLineDivergence,
  mergeStepDiffWithMaterialMarks,
} from "../lib/first-line-divergence";
import { compareMaterialLines } from "../lib/material-line-diff";
import { twoPassEventDiff } from "../lib/two-pass-event-diff";
import { LineCompareTable } from "./line-compare-table";
import { PassLinePanel } from "./pass-line-panel";

export function LineCompare({
  left,
  right,
  resetKey,
  compact,
  openingHand,
  turn2Kill,
}: {
  left: { label: string; damage: number; events: LineEvent[]; note?: string };
  right: { label: string; damage: number; events: LineEvent[]; note?: string };
  resetKey: string;
  compact?: boolean;
  openingHand?: CardId[];
  turn2Kill?: Readonly<{ damage: number; threshold: number }> | null;
}) {
  const diff = twoPassEventDiff(left.events, right.events);
  const material = compareMaterialLines(
    left.events,
    right.events,
    left.damage,
    right.damage,
  );
  const leftStepDiff = mergeStepDiffWithMaterialMarks(
    diff.brick,
    material.marks.left,
  );
  const rightStepDiff = mergeStepDiffWithMaterialMarks(
    diff.oracle,
    material.marks.right,
  );
  const leftDiffCount = countMaterialDiffs(material.marks.left);
  const rightDiffCount = countMaterialDiffs(material.marks.right);
  const divergence = firstLineDivergence(
    left.events,
    right.events,
    left.damage,
    right.damage,
  );
  const damageDelta = right.damage - left.damage;

  return (
    <div className={cn("mt-7 grid gap-7", compact && "mt-5 gap-5")}>
      <LineCompareTable
        leftEvents={left.events}
        rightEvents={right.events}
        leftLabel={left.label}
        leftDamage={left.damage}
        rightLabel={right.label}
        rightDamage={right.damage}
        material={material}
        turn2Kill={turn2Kill}
      />
      {material.equivalent ? (
        <p className="m-0 text-[13px] leading-[1.45] text-muted">
          Your line matches the optimal line ({left.damage} damage). Steps differ
          only in play order.
        </p>
      ) : divergence ? (
        <p className="m-0 text-[13px] leading-[1.45] text-muted">
          First material divergence at step {divergence.index + 1}:{" "}
          <strong className="font-medium text-foreground">{divergence.summary}</strong>
          {damageDelta !== 0 && (
            <>
              {" "}
              · optimal line deals{" "}
              <strong className="font-medium text-foreground">
                {damageDelta > 0 ? `+${damageDelta}` : damageDelta}
              </strong>{" "}
              damage
            </>
          )}
        </p>
      ) : rightDiffCount === 0 && leftDiffCount === 0 ? (
        <p className="m-0 text-[13px] leading-[1.45] text-muted">
          Your line matches the optimal line ({left.damage} damage).
        </p>
      ) : (
        <p className="m-0 text-[13px] leading-[1.45] text-muted">
          {leftDiffCount > 0 && rightDiffCount > 0
            ? `${leftDiffCount} of your decisions and ${rightDiffCount} optimal decision${rightDiffCount === 1 ? "" : "s"} differ — highlighted below`
            : leftDiffCount > 0
              ? `${leftDiffCount} of your decisions differ from optimal — highlighted below`
              : `${rightDiffCount} optimal decision${rightDiffCount === 1 ? "" : "s"} differ from your line — highlighted below`}
        </p>
      )}
      <PassLinePanel
        label={left.label}
        damage={left.damage}
        events={left.events}
        resetKey={`${resetKey}-left`}
        stepDiff={leftStepDiff}
        note={left.note}
        damageDelta={left.damage - right.damage}
        openingHand={openingHand}
      />
      <PassLinePanel
        label={right.label}
        damage={right.damage}
        events={right.events}
        resetKey={`${resetKey}-right`}
        stepDiff={rightStepDiff}
        oracle
        note={right.note}
        openingHand={openingHand}
      />
    </div>
  );
}
