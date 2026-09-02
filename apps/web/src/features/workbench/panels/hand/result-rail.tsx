"use client";

import type { CardId, SolveResult } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  AverageDamageStat,
  DamageReadout,
  DistributionSummary,
  distributionStatItem,
  Turn2KillHorizon,
} from "../../ui";
import {
  CardLeaderboardPanel,
  leaderboardFromCardStats,
} from "../card-leaderboard";
import { LineInspector, sampleFromSolveResult } from "../sample-detail";
import type { LineHorizon, Turn2KillResults } from "../../types";
import { SIM_TYPE_LABELS } from "../../types";
import { percentileFromValues } from "../../lib/deck-stats";

const resultRailClass = cn(
  "result-rail min-w-0 border-t border-border mt-2 pt-7 pl-0",
  "max-[900px]:border-t max-[900px]:border-l-0 max-[900px]:pt-7 max-[900px]:pl-0",
);

function resultReadout(result: SolveResult) {
  const mode = result.simType ?? "fire_brick";
  const distribution = result.distribution;
  const twoPass = result.twoPass;
  const isMonteCarlo = mode === "monte_carlo" && Boolean(distribution);
  const isTwoPass = mode === "two_pass" && Boolean(twoPass);

  if (isTwoPass && twoPass) {
    return {
      label: "TWO-PASS",
      value: (
        <>
          {twoPass.brick.maxDamage}
          <span className="mx-[0.08em] font-medium text-muted">/</span>
          {twoPass.oracle.maxDamage}
        </>
      ),
      detail: `Brick / Oracle · ${result.nodes.toLocaleString()} states searched`,
      mode,
      distribution,
      twoPass,
      isMonteCarlo: false,
      isTwoPass: true,
    };
  }

  if (isMonteCarlo && distribution) {
    return {
      label: "P50 DAMAGE",
      value: distribution.p50,
      detail: (
        <>
          Monte Carlo · {distribution.min}–{distribution.max} range ·{" "}
          {result.nodes.toLocaleString()} states
        </>
      ),
      mode,
      distribution,
      twoPass,
      isMonteCarlo: true,
      isTwoPass: false,
    };
  }

  return {
    label: "MAX DAMAGE",
    value: result.maxDamage,
    detail: (
      <>
        {SIM_TYPE_LABELS[mode]} · {result.nodes.toLocaleString()} states searched
      </>
    ),
    mode,
    distribution,
    twoPass,
    isMonteCarlo: false,
    isTwoPass: false,
  };
}

function ResultBody({
  result,
  hand,
  busy,
}: {
  result: SolveResult;
  hand: CardId[];
  busy: boolean;
}) {
  const readout = resultReadout(result);
  const sample = sampleFromSolveResult(result, hand);

  return (
    <>
      <DamageReadout
        label={readout.label}
        value={readout.value}
        detail={readout.detail}
        calculating={busy}
      />
      {readout.isMonteCarlo && readout.distribution && (
        <DistributionSummary
          items={[
            distributionStatItem(
              "p10",
              readout.distribution.p10 ??
                percentileFromValues(readout.distribution.damages, 10),
            ),
            distributionStatItem("p90", readout.distribution.p90),
            distributionStatItem(
              "range",
              <>
                {readout.distribution.min}–{readout.distribution.max}
              </>,
            ),
          ]}
          average={
            <AverageDamageStat value={readout.distribution.mean.toFixed(1)} />
          }
        />
      )}
      {result.cardStats && result.cardStats.length > 0 && (
        <CardLeaderboardPanel
          collapsible
          {...(readout.isTwoPass && readout.twoPass
            ? {
                twoPassLeaderboards: {
                  combined: leaderboardFromCardStats(result.cardStats, 2),
                  brick: leaderboardFromCardStats(
                    readout.twoPass.brick.cardStats ?? [],
                    1,
                  ),
                  oracle: leaderboardFromCardStats(
                    readout.twoPass.oracle.cardStats ?? [],
                    1,
                  ),
                },
              }
            : {
                leaderboard: leaderboardFromCardStats(
                  result.cardStats,
                  readout.isMonteCarlo && readout.distribution
                    ? readout.distribution.damages.length
                    : 1,
                ),
              })}
        />
      )}
      <LineInspector
        sample={sample}
        mode={readout.mode}
        showSendToSolver={false}
        showDamageReadout={false}
        resetKeyPrefix="solve"
      />
    </>
  );
}

export function ResultRail({
  result,
  busy,
  hand,
  turn2KillResults,
  lineHorizon,
  onLineHorizonChange,
}: {
  result: SolveResult | null;
  busy: boolean;
  hand: CardId[];
  turn2KillResults?: Turn2KillResults | null;
  lineHorizon?: LineHorizon;
  onLineHorizonChange?: (horizon: LineHorizon) => void;
}) {
  if (!result) {
    if (!busy) return null;

    return (
      <aside className={resultRailClass} aria-live="polite">
        <DamageReadout label="MAX DAMAGE" value="—" calculating />
      </aside>
    );
  }

  const showTurn2Kill = Boolean(turn2KillResults);
  const activeHorizon = lineHorizon ?? 3;

  return (
    <aside className={resultRailClass} aria-live="polite">
      {showTurn2Kill && turn2KillResults ? (
        <Turn2KillHorizon
          results={turn2KillResults}
          lineHorizon={activeHorizon}
          onLineHorizonChange={(horizon) => onLineHorizonChange?.(horizon)}
        />
      ) : null}
      <ResultBody result={result} hand={hand} busy={busy} />
    </aside>
  );
}
