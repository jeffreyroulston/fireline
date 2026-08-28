"use client";

import { useEffect, useState } from "react";
import { CARD_LIST, isPlayableDeckCard, type CardId, type SimType, type SolveResult } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import {
  ActionBar,
  DamageReadout,
  DeckPicker,
  HandCard,
  RunSettings,
  SectionHeading,
  StatLine,
} from "../ui";
import {
  CardLeaderboardPanel,
  leaderboardFromCardStats,
} from "./card-leaderboard";
import { LineInspector, sampleFromSolveResult } from "./sample-detail";
import { SIM_TYPE_LABELS, type SolverMode } from "../types";
import { OPENING_HAND_SIZE } from "../utils";
import { percentileFromValues } from "../lib/deck-stats";

const SOLVER_MODES: { id: SolverMode; label: string }[] = [
  { id: "hand", label: "Hand" },
  { id: "deck", label: "Deck" },
];

function CardStrip({
  ids,
  empty,
  ariaLabel,
  onRemove,
}: {
  ids: CardId[];
  empty: string;
  ariaLabel: string;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="hand-strip" aria-label={ariaLabel}>
      {ids.map((id, index) => (
        <HandCard
          key={`${ariaLabel}-${id}-${index}`}
          id={id}
          onClick={() => onRemove(index)}
        />
      ))}
      {ids.length === 0 && <p className="empty-note">{empty}</p>}
    </div>
  );
}

export function HandBuilder({
  hand,
  drawn,
  solverMode,
  selectedCard,
  decks,
  activeDeck,
  recognizedDeckCount,
  remainingCount,
  shuffled,
  seed,
  goFirst,
  turns,
  simType,
  rollouts,
  busy,
  onHandChange,
  onDrawnChange,
  onSolverModeChange,
  onSelectedCardChange,
  onSwitchDeck,
  onDrawRandomHand,
  onDrawCard,
  onShuffleDeck,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onSolve,
  onCancel,
  decksLoading = false,
}: {
  hand: CardId[];
  drawn: CardId[];
  solverMode: SolverMode;
  selectedCard: CardId;
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedDeckCount: number;
  remainingCount: number;
  shuffled: boolean;
  seed: number;
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  busy: boolean;
  onHandChange: (hand: CardId[]) => void;
  onDrawnChange: (drawn: CardId[]) => void;
  onSolverModeChange: (mode: SolverMode) => void;
  onSelectedCardChange: (id: CardId) => void;
  onSwitchDeck: (deckId: string) => void;
  onDrawRandomHand: () => void;
  onDrawCard: () => void;
  onShuffleDeck: () => void;
  onGoFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onSolve: () => void;
  onCancel: () => void;
  decksLoading?: boolean;
}) {
  const isDeckMode = solverMode === "deck";
  const canDrawHand =
    decks.length > 0 && recognizedDeckCount >= OPENING_HAND_SIZE;
  const canDrawCard = remainingCount > 0;
  const playableCards = CARD_LIST.filter(isPlayableDeckCard).sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  return (
    <div className="mode-layout line-mode">
      <div className="controls">
        <div
          className="solver-mode-tabs"
          role="tablist"
          aria-label="Hand solver mode"
        >
          {SOLVER_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={solverMode === mode.id}
              className={
                solverMode === mode.id
                  ? "solver-mode-tab is-active"
                  : "solver-mode-tab"
              }
              onClick={() => onSolverModeChange(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <SectionHeading
          title="OPENING HAND"
          meta={<strong>{hand.length} cards</strong>}
        />
        <CardStrip
          ids={hand}
          ariaLabel="Selected opening hand"
          empty="Draw from a saved deck or add cards below."
          onRemove={(index) =>
            onHandChange(hand.filter((_, itemIndex) => itemIndex !== index))
          }
        />

        <div className="deck-toolbar">
          <DeckPicker
            label="Draw from deck"
            decks={decks}
            value={activeDeck?.id ?? ""}
            onChange={onSwitchDeck}
            loading={decksLoading}
          />
          <div className="deck-toolbar-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={onDrawRandomHand}
              disabled={!canDrawHand}
              title={
                canDrawHand
                  ? `Shuffle with a new seed and draw ${OPENING_HAND_SIZE}`
                  : `Need a saved deck with at least ${OPENING_HAND_SIZE} recognized cards`
              }
            >
              Draw random hand
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={onShuffleDeck}
              disabled={!canDrawHand}
              title={
                canDrawHand
                  ? "Shuffle with a new seed and deal a new opening hand"
                  : `Need a saved deck with at least ${OPENING_HAND_SIZE} recognized cards`
              }
            >
              Shuffle deck
            </button>
          </div>
        </div>

        {isDeckMode && (
          <div className="drawn-block">
            <SectionHeading
              title="DRAWN"
              meta={
                <strong>
                  {drawn.length} drawn · {remainingCount} left
                </strong>
              }
            />
            <CardStrip
              ids={drawn}
              ariaLabel="Cards drawn after the opening hand"
              empty="Draw the next card from the remaining pile."
              onRemove={(index) => onDrawnChange(drawn.slice(0, index))}
            />
            <div className="deck-toolbar">
              <button
                className="secondary-action"
                type="button"
                onClick={onDrawCard}
                disabled={!canDrawCard}
                title={
                  canDrawCard
                    ? "Draw the next card from the remaining pile"
                    : "No cards left in the deck"
                }
              >
                Draw card
              </button>
            </div>
          </div>
        )}

        <div className="add-card-row">
          <label>
            Add card
            <select
              value={selectedCard}
              onChange={(event) =>
                onSelectedCardChange(event.target.value as CardId)
              }
            >
              {playableCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-action"
            type="button"
            onClick={() =>
              onHandChange(hand.length < 8 ? [...hand, selectedCard] : hand)
            }
          >
            Add to hand
          </button>
          {isDeckMode && (
            <button
              className="secondary-action"
              type="button"
              onClick={() => onDrawnChange([...drawn, selectedCard])}
              disabled={!shuffled}
              title={
                shuffled
                  ? "Take the first remaining copy of this card from the pile"
                  : "Shuffle the deck before adding to drawn"
              }
            >
              Add to drawn
            </button>
          )}
        </div>
        <RunSettings
          goFirst={goFirst}
          turns={turns}
          simType={simType}
          rollouts={rollouts}
          seed={shuffled ? seed : undefined}
          orderedPile={isDeckMode && shuffled}
          onFirstChange={onGoFirstChange}
          onTurnsChange={onTurnsChange}
          onSimTypeChange={onSimTypeChange}
          onRolloutsChange={onRolloutsChange}
        />
        <ActionBar
          label="Calculate maximum damage"
          busy={busy}
          onRun={onSolve}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

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
      <aside className="result-rail" aria-live="polite">
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
              <span className="damage-split">/</span>
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
    <aside
      className={`result-rail${isTwoPass ? " two-pass-rail" : ""}`}
      aria-live="polite"
    >
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
