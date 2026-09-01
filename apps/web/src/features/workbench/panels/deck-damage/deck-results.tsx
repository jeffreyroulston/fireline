"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { errorBannerClass } from "@/lib/utils/ui-classes";
import {
  DamageReadout,
} from "../../ui";
import {
  buildBarHighlights,
  CardLeaderboardPanel,
  highlightsFromHands,
  leaderboardFromCardStats,
} from "../card-leaderboard";
import {
  distributionFromDeckResult,
  PooledDamagePanel,
  sampleBarsFromDeckResult,
} from "../pooled-damage";
import { SIM_TYPE_LABELS, type DeckResult, type SampleHand } from "../../types";

const resultRailClass = cn(
  "min-w-0 border-t border-border mt-2 pt-7 pl-0",
  "max-[900px]:border-t max-[900px]:border-l-0 max-[900px]:pt-7 max-[900px]:pl-0",
);

export function DeckResults({
  result,
  busy,
  failed = false,
  errorMessage = null,
  onSendToHandSolver,
}: {
  result: DeckResult | null;
  busy: boolean;
  failed?: boolean;
  errorMessage?: string | null;
  onSendToHandSolver: (sample: SampleHand) => void;
}) {
  const [selectedLeaderboardCard, setSelectedLeaderboardCard] = useState<
    string | null
  >(null);

  useEffect(() => {
    setSelectedLeaderboardCard(null);
  }, [result]);

  const sampleHighlights = useMemo(
    () => (result ? highlightsFromHands(result.hands) : []),
    [result],
  );
  const barCardHighlights = useMemo(
    () => buildBarHighlights(sampleHighlights, selectedLeaderboardCard),
    [sampleHighlights, selectedLeaderboardCard],
  );

  if (failed && !busy) {
    return (
      <aside className={resultRailClass} aria-live="polite">
        <DamageReadout label="EXPECTED DAMAGE" value="—" />
        <p className={cn(errorBannerClass, "mt-4")} role="alert">
          {errorMessage?.trim() || "Deck simulation failed."}
        </p>
      </aside>
    );
  }

  if (!result) {
    if (!busy) return null;

    return (
      <aside className={resultRailClass} aria-live="polite">
        <DamageReadout label="EXPECTED DAMAGE" value="—" calculating />
      </aside>
    );
  }

  const mode = result.simType ?? "fire_brick";
  const isTwoPass = mode === "two_pass";
  const distribution = distributionFromDeckResult(result);
  const bars = sampleBarsFromDeckResult(result);

  return (
    <aside className={resultRailClass} aria-live="polite">
      <div className="grid gap-[22px]">
        <PooledDamagePanel
          meta={
            <strong>
              {SIM_TYPE_LABELS[mode]} · {result.samples} opening hands
              {(result.timedOutSamples ?? 0) > 0
                ? ` · ${result.timedOutSamples} timed out`
                : ""}
            </strong>
          }
          distribution={distribution}
          bars={bars}
          simType={mode}
          cardHighlights={barCardHighlights}
          highlightCardId={selectedLeaderboardCard}
          liveHands={result.hands}
          showSendToSolver
          onSendToHandSolver={onSendToHandSolver}
          resetKey={`${mode}:${result.samples}:${result.mean}:${result.min}:${result.max}`}
        />
        {result.cardStats && result.cardStats.length > 0 && (
          <CardLeaderboardPanel
            selectedCardId={selectedLeaderboardCard}
            onSelectedCardIdChange={setSelectedLeaderboardCard}
            {...(isTwoPass &&
            result.brickCardStats &&
            result.brickCardStats.length > 0 &&
            result.oracleCardStats &&
            result.oracleCardStats.length > 0
              ? {
                  twoPassLeaderboards: {
                    combined: leaderboardFromCardStats(
                      result.cardStats,
                      result.samples * 2,
                      { hands: result.hands, pass: "combined" },
                    ),
                    brick: leaderboardFromCardStats(
                      result.brickCardStats,
                      result.samples,
                      { hands: result.hands, pass: "brick" },
                    ),
                    oracle: leaderboardFromCardStats(
                      result.oracleCardStats,
                      result.samples,
                      { hands: result.hands, pass: "oracle" },
                    ),
                  },
                }
              : {
                  leaderboard: leaderboardFromCardStats(
                    result.cardStats,
                    result.samples,
                    { hands: result.hands },
                  ),
                })}
          />
        )}
      </div>
    </aside>
  );
}
