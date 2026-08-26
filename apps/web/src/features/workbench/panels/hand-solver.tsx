"use client";

import { useEffect, useState } from "react";
import { CARDS, CARD_LIST, type CardId, type CardStat, type DamageDistribution, type SimType, type SolveResult, type TwoPassResult } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { DRILL_3_HAND } from "@/lib/fixtures/drills";
import { CardStatsPanel, OptimalLine, RunSettings, ActionBar, TwoPassCompare } from "../ui";
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
        <div className="section-heading">
          <span>OPENING HAND</span>
          <strong>{hand.length} cards</strong>
        </div>
        <div className="hand-strip" aria-label="Selected opening hand">
          {hand.map((id, index) => (
            <button
              className={`card-tile is-${CARDS[id].element}`}
              key={`${id}-${index}`}
              onClick={() =>
                onHandChange(hand.filter((_, itemIndex) => itemIndex !== index))
              }
              title="Remove card"
            >
              <span>{CARDS[id].element === "fire" ? "FIRE" : "NORM"}</span>
              <b>{CARDS[id].name}</b>
              <small>
                {CARDS[id].cost}R · {CARDS[id].kind}
              </small>
            </button>
          ))}
          {hand.length === 0 && (
            <p className="empty-note">
              Draw from a saved deck or add cards below.
            </p>
          )}
        </div>

        <div className="deck-toolbar">
          <label className="deck-picker">
            Draw from deck
            <select
              value={activeDeck?.id ?? ""}
              onChange={(event) => onSwitchDeck(event.target.value)}
              disabled={decks.length === 0}
            >
              {decks.length === 0 && <option value="">No saved decks</option>}
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-action"
            type="button"
            onClick={onDrawRandomHand}
            disabled={!canDraw}
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
              {CARD_LIST.filter((card) => card.id !== "brick").map((card) => (
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
          <button
            className="text-action"
            onClick={() => onHandChange(DRILL_3_HAND)}
          >
            Load drill #3
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
        <div className="damage-readout">
          <span>MAX DAMAGE</span>
          <strong className={busy ? "calculating" : ""}>—</strong>
          <small>Run a hand to reveal the line</small>
        </div>
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
      <div className="damage-readout">
        <span>MAX DAMAGE</span>
        <strong className={busy ? "calculating" : ""}>
          {result.maxDamage}
        </strong>
        <small>
          {SIM_TYPE_LABELS[mode]} · {result.nodes.toLocaleString()} states
          searched
        </small>
      </div>
      {result.cardStats && result.cardStats.length > 0 && (
        <CardStatsPanel stats={result.cardStats} samples={1} mode={mode} />
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
      <div className="damage-readout">
        <span>P50 DAMAGE</span>
        <strong className={busy ? "calculating" : ""}>{distribution.p50}</strong>
        <small>
          Monte Carlo · {distribution.min}–{distribution.max} range ·{" "}
          {nodes.toLocaleString()} states
        </small>
      </div>
      <div className="stat-line">
        <span>
          <small>MEAN</small>
          <b>{distribution.mean.toFixed(1)}</b>
        </span>
        <span>
          <small>P90</small>
          <b>{distribution.p90}</b>
        </span>
        <span>
          <small>RANGE</small>
          <b>
            {distribution.min}–{distribution.max}
          </b>
        </span>
      </div>
      {cardStats && cardStats.length > 0 && (
        <CardStatsPanel
          stats={cardStats}
          samples={distribution.damages.length}
          mode="monte_carlo"
        />
      )}
      <div className="damage-bars" aria-label="Monte Carlo rollout damages">
        {distribution.damages.map((damage, index) => (
          <button
            type="button"
            className={selected === index ? "is-selected" : undefined}
            key={`mc-${damage}-${index}`}
            style={{ height: `${Math.max(8, (damage / scaleMax) * 100)}%` }}
            title={`Rollout ${index + 1}: ${damage} damage`}
            aria-pressed={selected === index}
            onClick={() =>
              onSelect(selected === index ? null : index)
            }
          />
        ))}
      </div>
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
      <div className="damage-readout">
        <span>TWO-PASS</span>
        <strong className={busy ? "calculating" : ""}>
          {twoPass.brick.maxDamage}
          <span className="damage-split">/</span>
          {twoPass.oracle.maxDamage}
        </strong>
        <small>
          Brick / Oracle · {nodes.toLocaleString()} states searched
        </small>
      </div>
      {cardStats && cardStats.length > 0 && (
        <CardStatsPanel stats={cardStats} samples={1} mode="two_pass" />
      )}
      <TwoPassCompare
        brick={twoPass.brick}
        oracle={twoPass.oracle}
        resetKey={`${twoPass.brick.maxDamage}-${twoPass.oracle.maxDamage}-${twoPass.brick.steps.length}`}
      />
    </aside>
  );
}
