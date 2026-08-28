"use client";

import { useEffect, useMemo, useState } from "react";
import { type SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { DamageReadout, DeckPicker, RunSettings, ActionBar, SectionHeading } from "../ui";
import {
  buildBarHighlights,
  CardLeaderboardPanel,
  highlightsFromHands,
  leaderboardFromCardStats,
} from "./card-leaderboard";
import {
  distributionFromDeckResult,
  PooledDamagePanel,
  sampleBarsFromDeckResult,
} from "./pooled-damage";
import { SIM_TYPE_LABELS, type DeckResult, type SampleHand } from "../types";
import type { OptimizeProgress } from "@/lib/api/useRun";

export function DeckEditor({
  decks,
  activeDeck,
  recognizedDeckCount,
  samples,
  goFirst,
  turns,
  simType,
  rollouts,
  busy,
  onSwitchDeck,
  onSamplesChange,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onEvaluate,
  onCancel,
  progress,
  decksLoading = false,
}: {
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedDeckCount: number;
  samples: number;
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  busy: boolean;
  onSwitchDeck: (deckId: string) => void;
  onSamplesChange: (value: number) => void;
  onGoFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onEvaluate: () => void;
  onCancel: () => void;
  progress?: OptimizeProgress | null;
  decksLoading?: boolean;
}) {
  return (
    <div className="mode-layout line-mode">
      <div className="controls">
        <SectionHeading
          title="DECK DAMAGE"
          meta={<strong>{recognizedDeckCount} recognized</strong>}
        />
        <div className="deck-toolbar">
          <DeckPicker
            label="Saved deck"
            decks={decks}
            value={activeDeck?.id ?? ""}
            onChange={onSwitchDeck}
            loading={decksLoading}
          />
        </div>
        <div className="settings-row">
          <label>
            Opening hands
            <input
              type="number"
              min={1}
              max={50}
              value={samples}
              onChange={(event) => onSamplesChange(Number(event.target.value))}
            />
          </label>
        </div>
        <RunSettings
          goFirst={goFirst}
          turns={turns}
          simType={simType}
          rollouts={rollouts}
          onFirstChange={onGoFirstChange}
          onTurnsChange={onTurnsChange}
          onSimTypeChange={onSimTypeChange}
          onRolloutsChange={onRolloutsChange}
        />
        <ActionBar
          label="Sample deck damage"
          busy={busy}
          onRun={onEvaluate}
          onCancel={onCancel}
          progress={progress}
          monteCarloRollouts={simType === "monte_carlo" ? rollouts : undefined}
        />
      </div>
    </div>
  );
}

export function DeckResults({
  result,
  busy,
  onSendToHandSolver,
}: {
  result: DeckResult | null;
  busy: boolean;
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

  if (!result) {
    if (!busy) return null;

    return (
      <aside className="result-rail" aria-live="polite">
        <DamageReadout label="EXPECTED DAMAGE" value="—" calculating />
      </aside>
    );
  }

  const mode = result.simType ?? "fire_brick";
  const isTwoPass = mode === "two_pass";
  const distribution = distributionFromDeckResult(result);
  const bars = sampleBarsFromDeckResult(result);

  return (
    <aside className="result-rail" aria-live="polite">
      <PooledDamagePanel
        meta={
          <strong>
            {SIM_TYPE_LABELS[mode]} · {result.samples} opening hands
          </strong>
        }
        distribution={distribution}
        bars={bars}
        simType={mode}
        cardHighlights={barCardHighlights}
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
    </aside>
  );
}
