"use client";

import { useEffect, useState } from "react";
import { CARD_LIST, type CardId, type CardStat, type DamageDistribution, type SimType, type SolveResult, type TwoPassResult } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import {
  ActionBar,
  DamageBars,
  DamageReadout,
  DeckPicker,
  HandCard,
  OptimalLine,
  RunSettings,
  SectionHeading,
  StatLine,
  TwoPassCompare,
} from "../ui";
import {
  CardLeaderboardPanel,
  leaderboardFromCardStats,
} from "./card-leaderboard";
import { SIM_TYPE_LABELS } from "../types";
import { OPENING_HAND_SIZE } from "../utils";

export function HandBuilder({
  hand,
  selectedCard,
  decks,
  activeDeck,
  recognizedDeckCount,
  goFirst,
  turns,
  simType,
  rollouts,
  busy,
  onHandChange,
  onSelectedCardChange,
  onSwitchDeck,
  onDrawRandomHand,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onSolve,
  onCancel,
}: {
  hand: CardId[];
  selectedCard: CardId;
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedDeckCount: number;
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  busy: boolean;
  onHandChange: (hand: CardId[]) => void;
  onSelectedCardChange: (id: CardId) => void;
  onSwitchDeck: (deckId: string) => void;
  onDrawRandomHand: () => void;
  onGoFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onSolve: () => void;
  onCancel: () => void;
}) {
  const canDraw =
    decks.length > 0 && recognizedDeckCount >= OPENING_HAND_SIZE;

  return (
    <div className="mode-layout line-mode">
      <div className="controls">
        <SectionHeading
          title="OPENING HAND"
          meta={<strong>{hand.length} cards</strong>}
        />
        <div className="hand-strip" aria-label="Selected opening hand">
          {hand.map((id, index) => (
            <HandCard
              key={`${id}-${index}`}
              id={id}
              onClick={() =>
                onHandChange(hand.filter((_, itemIndex) => itemIndex !== index))
              }
            />
          ))}
          {hand.length === 0 && (
            <p className="empty-note">
              Draw from a saved deck or add cards below.
            </p>
          )}
        </div>

        <div className="deck-toolbar">
          <DeckPicker
            label="Draw from deck"
            decks={decks}
            value={activeDeck?.id ?? ""}
            onChange={onSwitchDeck}
          />
          <button
            className="secondary-action"
            type="button"
            onClick={onDrawRandomHand}
            disabled={!canDraw}
            autoComplete="off"
            title={
              canDraw
                ? `Draw ${OPENING_HAND_SIZE} cards from the selected deck`
                : `Need a saved deck with at least ${OPENING_HAND_SIZE} recognized cards`
            }
          >
            Draw random hand
          </button>
        </div>

        <div className="add-card-row">
          <label>
            Add card
            <select
              value={selectedCard}
              onChange={(event) =>
                onSelectedCardChange(event.target.value as CardId)
              }
            >
              {CARD_LIST.filter((card) => card.id !== "brick")
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="secondary-action"
            onClick={() =>
              onHandChange(
                hand.length < 8 ? [...hand, selectedCard] : hand,
              )
            }
          >
            Add to hand
          </button>
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
}: {
  result: SolveResult | null;
  busy: boolean;
}) {
  const [mcIndex, setMcIndex] = useState<number | null>(null);

  useEffect(() => {
    setMcIndex(null);
  }, [result]);

  if (!result) {
    return (
      <aside className="result-rail" aria-live="polite">
        <DamageReadout
          label="MAX DAMAGE"
          value="—"
          detail="Run a hand to reveal the line"
          calculating={busy}
        />
      </aside>
    );
  }

  const mode = result.simType ?? "fire_brick";

  if (mode === "monte_carlo" && result.distribution) {
    return (
      <MonteCarloResult
        distribution={result.distribution}
        nodes={result.nodes}
        busy={busy}
        selected={mcIndex}
        onSelect={setMcIndex}
        cardStats={result.cardStats}
      />
    );
  }

  if (mode === "two_pass" && result.twoPass) {
    return (
      <TwoPassResultView
        twoPass={result.twoPass}
        nodes={result.nodes}
        busy={busy}
        cardStats={result.cardStats}
      />
    );
  }

  return (
    <aside className="result-rail" aria-live="polite">
      <DamageReadout
        label="MAX DAMAGE"
        value={result.maxDamage}
        detail={
          <>
            {SIM_TYPE_LABELS[mode]} · {result.nodes.toLocaleString()} states
            searched
          </>
        }
        calculating={busy}
      />
      {result.cardStats && result.cardStats.length > 0 && (
        <CardLeaderboardPanel
          collapsible
          leaderboard={leaderboardFromCardStats(result.cardStats, 1)}
        />
      )}
      <OptimalLine
        sampleId={result.sampleId}
        steps={result.steps}
        resetKey={result}
      />
    </aside>
  );
}

export function MonteCarloResult({
  distribution,
  nodes,
  busy,
  selected,
  onSelect,
  cardStats,
}: {
  distribution: DamageDistribution;
  nodes: number;
  busy: boolean;
  selected: number | null;
  onSelect: (index: number | null) => void;
  cardStats?: CardStat[];
}) {
  const scaleMax = Math.max(distribution.max, 1);
  const rollout =
    selected !== null ? (distribution.rollouts[selected] ?? null) : null;

  return (
    <aside className="result-rail" aria-live="polite">
      <DamageReadout
        label="P50 DAMAGE"
        value={distribution.p50}
        detail={
          <>
            Monte Carlo · {distribution.min}–{distribution.max} range ·{" "}
            {nodes.toLocaleString()} states
          </>
        }
        calculating={busy}
      />
      <StatLine
        items={[
          { label: "MEAN", value: distribution.mean.toFixed(1) },
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
      {cardStats && cardStats.length > 0 && (
        <CardLeaderboardPanel
          collapsible
          leaderboard={leaderboardFromCardStats(
            cardStats,
            distribution.damages.length,
          )}
        />
      )}
      <DamageBars
        ariaLabel="Monte Carlo rollout damages"
        scaleMax={scaleMax}
        selectedKey={selected != null ? String(selected) : null}
        onSelect={(key) => onSelect(key == null ? null : Number(key))}
        items={distribution.damages.map((damage, index) => ({
          key: String(index),
          damage,
          title: `Rollout ${index + 1}: ${damage} damage`,
        }))}
      />
      {rollout && (
        <OptimalLine
          label={`ROLLOUT ${selected! + 1} · ${rollout.damage} DAMAGE`}
          steps={rollout.steps}
          resetKey={`mc-${selected}-${rollout.damage}`}
        />
      )}
    </aside>
  );
}

export function TwoPassResultView({
  twoPass,
  nodes,
  busy,
  cardStats,
}: {
  twoPass: TwoPassResult;
  nodes: number;
  busy: boolean;
  cardStats?: CardStat[];
}) {
  return (
    <aside className="result-rail two-pass-rail" aria-live="polite">
      <DamageReadout
        label="TWO-PASS"
        value={
          <>
            {twoPass.brick.maxDamage}
            <span className="damage-split">/</span>
            {twoPass.oracle.maxDamage}
          </>
        }
        detail={`Brick / Oracle · ${nodes.toLocaleString()} states searched`}
        calculating={busy}
      />
      {cardStats && cardStats.length > 0 && (
        <CardLeaderboardPanel
          collapsible
          twoPassLeaderboards={{
            combined: leaderboardFromCardStats(cardStats, 2),
            brick: leaderboardFromCardStats(twoPass.brick.cardStats ?? [], 1),
            oracle: leaderboardFromCardStats(twoPass.oracle.cardStats ?? [], 1),
          }}
        />
      )}
      <TwoPassCompare
        brick={twoPass.brick}
        oracle={twoPass.oracle}
        resetKey={`${twoPass.brick.maxDamage}-${twoPass.oracle.maxDamage}-${twoPass.brick.steps.length}`}
      />
    </aside>
  );
}
