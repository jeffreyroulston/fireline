"use client";

import type { PassResult } from "@/lib/engine";
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

  return (
    <div className={`pass-stack ${compact ? "compact" : ""}`}>
      {oracleDiffCount > 0 && (
        <p className="pass-diff-note">
          {oracleDiffCount} oracle event{oracleDiffCount === 1 ? "" : "s"} differ
          from fire brick — highlighted below
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
