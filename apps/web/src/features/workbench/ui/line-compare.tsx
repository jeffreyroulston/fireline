"use client";

import type { CardId, LineEvent } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
import { twoPassEventDiff } from "../lib/two-pass-event-diff";
import { firstLineDivergence } from "../lib/first-line-divergence";
import { LineCompareTable } from "./line-compare-table";
import { PassLinePanel } from "./pass-line-panel";

export function LineCompare({
  left,
  right,
  resetKey,
  compact,
  openingHand,
}: {
  left: { label: string; damage: number; events: LineEvent[]; note?: string };
  right: { label: string; damage: number; events: LineEvent[]; note?: string };
  resetKey: string;
  compact?: boolean;
  openingHand?: CardId[];
}) {
  const diff = twoPassEventDiff(left.events, right.events);
  const rightDiffCount = diff.oracle.filter((entry) => entry.mark === "added").length;
  const leftDiffCount = diff.brick.filter((entry) => entry.mark === "removed").length;
  const divergence = firstLineDivergence(left.events, right.events);
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
      />
      {divergence ? (
        <p className="m-0 text-[13px] leading-[1.45] text-muted">
          First divergence at step {divergence.index + 1}:{" "}
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
            ? `${leftDiffCount} of your events and ${rightDiffCount} optimal event${rightDiffCount === 1 ? "" : "s"} differ — highlighted below`
            : leftDiffCount > 0
              ? `${leftDiffCount} of your events differ from optimal — highlighted below`
              : `${rightDiffCount} optimal event${rightDiffCount === 1 ? "" : "s"} differ from your line — highlighted below`}
        </p>
      )}
      <PassLinePanel
        label={left.label}
        damage={left.damage}
        events={left.events}
        resetKey={`${resetKey}-left`}
        stepDiff={diff.brick}
        note={left.note}
        damageDelta={left.damage - right.damage}
        openingHand={openingHand}
      />
      <PassLinePanel
        label={right.label}
        damage={right.damage}
        events={right.events}
        resetKey={`${resetKey}-right`}
        stepDiff={diff.oracle}
        oracle
        note={right.note}
        openingHand={openingHand}
      />
    </div>
  );
}
