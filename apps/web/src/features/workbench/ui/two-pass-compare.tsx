"use client";

import type { PassResult } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
import { PassLinePanel } from "./pass-line-panel";
import { twoPassEventDiff } from "../lib/two-pass-event-diff";

export function TwoPassCompare({
  brick,
  oracle,
  resetKey,
  compact,
}: {
  brick: PassResult;
  oracle: PassResult;
  resetKey: string;
  compact?: boolean;
}) {
  const diff = twoPassEventDiff(brick.events, oracle.events);
  const oracleDiffCount = diff.oracle.filter(
    (entry) => entry.mark === "added",
  ).length;
  const brickDiffCount = diff.brick.filter(
    (entry) => entry.mark === "removed",
  ).length;

  return (
    <div className={cn("mt-7 grid gap-7", compact && "mt-5 gap-5")}>
      {(oracleDiffCount > 0 || brickDiffCount > 0) && (
        <p className="m-0 text-[13px] leading-[1.45] text-muted">
          {brickDiffCount > 0 && oracleDiffCount > 0
            ? `${brickDiffCount} fire-brick event${brickDiffCount === 1 ? "" : "s"} and ${oracleDiffCount} oracle event${oracleDiffCount === 1 ? "" : "s"} differ — highlighted below`
            : brickDiffCount > 0
              ? `${brickDiffCount} fire-brick event${brickDiffCount === 1 ? "" : "s"} differ from oracle — highlighted below`
              : `${oracleDiffCount} oracle event${oracleDiffCount === 1 ? "" : "s"} differ from fire brick — highlighted below`}
        </p>
      )}
      <PassLinePanel
        label="Fire brick"
        damage={brick.maxDamage}
        events={brick.events}
        resetKey={`${resetKey}-brick`}
        stepDiff={diff.brick}
        note="Unknown draws stay blank (no peek)."
      />
      <PassLinePanel
        label="Oracle"
        damage={oracle.maxDamage}
        events={oracle.events}
        resetKey={`${resetKey}-oracle`}
        stepDiff={diff.oracle}
        oracle
        note="One shuffled remaining deck is known."
      />
    </div>
  );
}
