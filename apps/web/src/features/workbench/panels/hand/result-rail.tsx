"use client";

import { useEffect, useState } from "react";
import type { CardId, SolveResult } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
import {
  DamageReadout,
  StatLine,
} from "../../ui";
import {
  CardLeaderboardPanel,
  leaderboardFromCardStats,
} from "../card-leaderboard";
import { LineInspector, sampleFromSolveResult } from "../sample-detail";
import { SIM_TYPE_LABELS } from "../../types";
import { percentileFromValues } from "../../lib/deck-stats";

const resultRailClass = cn(
  "min-w-0 border-t border-border mt-2 pt-7 pl-0",
  "max-[900px]:border-t max-[900px]:border-l-0 max-[900px]:pt-7 max-[900px]:pl-0",
);

export function ResultRail({
  result,
  busy,
  hand,
}: {
  result: SolveResult | null;
  busy: boolean;
  hand: CardId[];
}) {
  const [mcIndex, setMcIndex] = useState<number | null>(null);

  useEffect(() => {
    setMcIndex(null);
  }, [result]);

  if (!result) {
    if (!busy) return null;

    return (
      <aside className={resultRailClass} aria-live="polite">
        <DamageReadout label="MAX DAMAGE" value="—" calculating />
      </aside>
    );
  }

  const mode = result.simType ?? "fire_brick";
  const distribution = result.distribution;
  const twoPass = result.twoPass;
  const isMonteCarlo = mode === "monte_carlo" && Boolean(distribution);
  const isTwoPass = mode === "two_pass" && Boolean(twoPass);
  const sample = sampleFromSolveResult(result, hand);

  const readout =
    isTwoPass && twoPass
      ? {
          label: "TWO-PASS",
          value: (
            <>
              {twoPass.brick.maxDamage}
              <span className="mx-[0.08em] font-medium text-muted">/</span>
              {twoPass.oracle.maxDamage}
            </>
          ),
          detail: `Brick / Oracle · ${result.nodes.toLocaleString()} states searched`,
        }
      : isMonteCarlo && distribution
        ? {
            label: "P50 DAMAGE",
            value: distribution.p50,
            detail: (
              <>
                Monte Carlo · {distribution.min}–{distribution.max} range ·{" "}
                {result.nodes.toLocaleString()} states
              </>
            ),
          }
        : {
            label: "MAX DAMAGE",
            value: result.maxDamage,
            detail: (
              <>
                {SIM_TYPE_LABELS[mode]} · {result.nodes.toLocaleString()}{" "}
                states searched
              </>
            ),
          };

  return (
    <aside className={resultRailClass} aria-live="polite">
      <DamageReadout
        label={readout.label}
        value={readout.value}
        detail={readout.detail}
        calculating={busy}
      />
      {isMonteCarlo && distribution && (
        <StatLine
          items={[
            { label: "MEAN", value: distribution.mean.toFixed(1) },
            {
              label: "P10",
              value:
                distribution.p10 ??
                percentileFromValues(distribution.damages, 10),
            },
            { label: "P90", value: distribution.p90 },
            {
              label: "RANGE",
              value: (
                <>
                  {distribution.min}–{distribution.max}
                </>
              ),
            },
          ]}
        />
      )}
      {result.cardStats && result.cardStats.length > 0 && (
        <CardLeaderboardPanel
          collapsible
          {...(isTwoPass && twoPass
            ? {
                twoPassLeaderboards: {
                  combined: leaderboardFromCardStats(result.cardStats, 2),
                  brick: leaderboardFromCardStats(
                    twoPass.brick.cardStats ?? [],
                    1,
                  ),
                  oracle: leaderboardFromCardStats(
                    twoPass.oracle.cardStats ?? [],
                    1,
                  ),
                },
              }
            : {
                leaderboard: leaderboardFromCardStats(
                  result.cardStats,
                  isMonteCarlo && distribution
                    ? distribution.damages.length
                    : 1,
                ),
              })}
        />
      )}
      <LineInspector
        sample={sample}
        mode={mode}
        mcIndex={mcIndex}
        onMcIndexChange={setMcIndex}
        showSendToSolver={false}
        resetKeyPrefix="solve"
      />
    </aside>
  );
}
