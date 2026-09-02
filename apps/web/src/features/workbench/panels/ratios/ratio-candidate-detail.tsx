"use client";

import { useEffect, useMemo, useState } from "react";
import { SecondaryActionButton } from "@/components/secondary-action-button";
import type { CardStat, DeckCounts, SimType } from "@/lib/engine";
import {
  buildBarHighlights,
  CardLeaderboardPanel,
  leaderboardFromCardStats,
} from "../card-leaderboard";
import {
  distributionFromDamages,
  PooledDamagePanel,
  sampleBarsFromDamages,
  syntheticDamagesForMean,
} from "../pooled-damage";
import { SIM_TYPE_LABELS } from "../../types";
import { RatioRankingRow } from "./ratio-ranking-row";
import { ratioSaveDeckClass } from "./shared";

export type RatioCandidateEntry = Readonly<{
  rank: number;
  score: number;
  counts: DeckCounts;
  scoreDelta?: number | null;
  candidate?: string | null;
  cardStats?: CardStat[];
  damages?: number[];
}>;

type RatioCandidateDetailProps = Readonly<{
  entry: RatioCandidateEntry;
  baseCounts: DeckCounts;
  baselineScore?: number | null;
  bestScore?: number | null;
  variant?: "search" | "multiDeck";
  samples: number;
  simType?: SimType;
  onBack: () => void;
  onSaveDecklist: (counts: DeckCounts, score: number, rank: number) => void;
}>;

export function RatioCandidateDetail({
  entry,
  baseCounts,
  baselineScore = null,
  bestScore = null,
  variant = "search",
  samples,
  simType = "monte_carlo",
  onBack,
  onSaveDecklist,
}: RatioCandidateDetailProps) {
  const [selectedLeaderboardCard, setSelectedLeaderboardCard] = useState<
    string | null
  >(null);

  useEffect(() => {
    setSelectedLeaderboardCard(null);
  }, [entry.rank, entry.score]);

  const damages = useMemo(
    () =>
      entry.damages && entry.damages.length > 0
        ? entry.damages
        : syntheticDamagesForMean(entry.score, samples),
    [entry.damages, entry.score, samples],
  );

  const distribution = useMemo(
    () => distributionFromDamages(damages, { mean: entry.score }),
    [damages, entry.score],
  );

  const bars = useMemo(
    () => sampleBarsFromDamages(damages, `ratio-${entry.rank}`),
    [damages, entry.rank],
  );

  const leaderboard = useMemo(
    () =>
      entry.cardStats && entry.cardStats.length > 0
        ? leaderboardFromCardStats(entry.cardStats, samples)
        : null,
    [entry.cardStats, samples],
  );

  const barCardHighlights = useMemo(
    () => buildBarHighlights([], selectedLeaderboardCard),
    [selectedLeaderboardCard],
  );

  return (
    <div className="grid gap-7">
      <SecondaryActionButton
        className="w-fit shrink-0 justify-self-start"
        onClick={onBack}
      >
        ← Back to summary
      </SecondaryActionButton>

      <div className="grid gap-3">
        <RatioRankingRow
          entry={entry}
          baseCounts={baseCounts}
          baselineScore={baselineScore}
          bestScore={bestScore}
          variant={variant}
        />

        <button
          type="button"
          className={ratioSaveDeckClass()}
          onClick={() =>
            onSaveDecklist(entry.counts, entry.score, entry.rank)
          }
        >
          Save decklist
        </button>
      </div>

      <div className="grid gap-[22px]">
        <PooledDamagePanel
          meta={
            <strong>
              {SIM_TYPE_LABELS[simType]} · {samples} opening hands
            </strong>
          }
          distribution={distribution}
          bars={bars}
          simType={simType}
          cardHighlights={barCardHighlights}
          highlightCardId={selectedLeaderboardCard}
          resetKey={`ratio-${entry.rank}-${entry.score}-${samples}`}
        />

        {leaderboard ? (
          <CardLeaderboardPanel
            leaderboard={leaderboard}
            selectedCardId={selectedLeaderboardCard}
            onSelectedCardIdChange={setSelectedLeaderboardCard}
          />
        ) : (
          <p className="m-0 font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
            No card stats for this candidate.
          </p>
        )}
      </div>
    </div>
  );
}
