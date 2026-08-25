"use client";

import { useEffect, useState } from "react";
import { CARDS, type DamageDistribution, type SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { CardStatsPanel, CombatTape, McRangeColumn, RunSettings, ActionBar, TwoPassCompare } from "./shared";
import { SIM_TYPE_LABELS, type DeckResult, type SampleHand } from "./types";

export function DeckEditor({
  decks,
  activeDeck,
  deckText,
  recognizedDeckCount,
  isRenamingDeck,
  renameDraft,
  samples,
  goFirst,
  turns,
  simType,
  rollouts,
  busy,
  onSwitchDeck,
  onCreateDeck,
  onStartRename,
  onDeleteDeck,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onDeckTextChange,
  onSamplesChange,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onEvaluate,
  onCancel,
}: {
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  deckText: string;
  recognizedDeckCount: number;
  isRenamingDeck: boolean;
  renameDraft: string;
  samples: number;
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  busy: boolean;
  onSwitchDeck: (deckId: string) => void;
  onCreateDeck: () => void;
  onStartRename: () => void;
  onDeleteDeck: () => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDeckTextChange: (text: string) => void;
  onSamplesChange: (value: number) => void;
  onGoFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onEvaluate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mode-layout line-mode">
      <div className="controls">
        <div className="section-heading">
          <span>DECKLIST</span>
          <strong>{recognizedDeckCount} recognized</strong>
        </div>
        <div className="deck-toolbar">
          <label className="deck-picker">
            Saved deck
            <select
              value={activeDeck?.id ?? ""}
              onChange={(event) => onSwitchDeck(event.target.value)}
              disabled={decks.length === 0}
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <div className="deck-toolbar-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={onCreateDeck}
            >
              New deck
            </button>
            <button
              className="text-action"
              type="button"
              onClick={onStartRename}
              disabled={!activeDeck}
            >
              Rename
            </button>
            <button
              className="text-action is-danger"
              type="button"
              onClick={onDeleteDeck}
              disabled={!activeDeck}
            >
              Delete
            </button>
          </div>
        </div>
        {isRenamingDeck && activeDeck && (
          <form
            className="deck-rename-row"
            onSubmit={(event) => {
              event.preventDefault();
              onCommitRename();
            }}
          >
            <label>
              Deck name
              <input
                autoFocus
                value={renameDraft}
                onChange={(event) => onRenameDraftChange(event.target.value)}
              />
            </label>
            <button className="secondary-action" type="submit">
              Save name
            </button>
            <button
              className="text-action"
              type="button"
              onClick={onCancelRename}
            >
              Cancel
            </button>
          </form>
        )}
        <label className="deck-input">
          One card per line, with quantity
          <textarea
            value={deckText}
            onChange={(event) => onDeckTextChange(event.target.value)}
            spellCheck={false}
          />
        </label>
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
  const [selected, setSelected] = useState<number | null>(null);
  const [mcIndex, setMcIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelected(null);
    setMcIndex(null);
  }, [result]);

  if (!result) {
    return (
      <aside className="result-rail">
        <div className="damage-readout">
          <span>EXPECTED DAMAGE</span>
          <strong className={busy ? "calculating" : ""}>—</strong>
          <small>Sample opening hands to build the distribution</small>
        </div>
      </aside>
    );
  }

  const mode = result.simType ?? "fire_brick";
  const isTwoPass = mode === "two_pass";
  const isMonteCarlo = mode === "monte_carlo";
  const twoPassPairs = result.hands.map((hand) => ({
    brick: hand.twoPass?.brick.maxDamage ?? hand.damage,
    oracle: hand.twoPass?.oracle.maxDamage ?? hand.damage,
  }));
  const mcRanges = result.hands.map((hand) => ({
    min: hand.distribution?.min ?? hand.damage,
    max: hand.distribution?.max ?? hand.damage,
    p50: hand.distribution?.p50 ?? hand.damage,
  }));
  const max = isTwoPass
    ? Math.max(1, ...twoPassPairs.flatMap((pair) => [pair.brick, pair.oracle]))
    : isMonteCarlo
      ? Math.max(1, ...mcRanges.map((range) => range.max))
      : Math.max(...result.damages, 1);
  const brickMean = isTwoPass
    ? twoPassPairs.reduce((sum, pair) => sum + pair.brick, 0) /
      Math.max(twoPassPairs.length, 1)
    : result.mean;
  const oracleMean = isTwoPass
    ? twoPassPairs.reduce((sum, pair) => sum + pair.oracle, 0) /
      Math.max(twoPassPairs.length, 1)
    : result.mean;
  const sample =
    selected !== null ? (result.hands?.[selected] ?? null) : null;

  return (
    <aside className="result-rail" aria-live="polite">
      <div className="damage-readout">
        <span>{isTwoPass ? "BRICK / ORACLE MEAN" : "MEAN DAMAGE"}</span>
        <strong>
          {isTwoPass ? (
            <>
              {brickMean.toFixed(1)}
              <span className="damage-split">/</span>
              {oracleMean.toFixed(1)}
            </>
          ) : (
            result.mean.toFixed(1)
          )}
        </strong>
        <small>
          {SIM_TYPE_LABELS[mode]} · {result.samples} opening hands · click a
          bar for the line
        </small>
      </div>
      {isTwoPass ? (
        <div className="stat-line">
          <span>
            <small>BRICK RANGE</small>
            <b>
              {Math.min(...twoPassPairs.map((p) => p.brick))}–
              {Math.max(...twoPassPairs.map((p) => p.brick))}
            </b>
          </span>
          <span>
            <small>ORACLE RANGE</small>
            <b>
              {Math.min(...twoPassPairs.map((p) => p.oracle))}–
              {Math.max(...twoPassPairs.map((p) => p.oracle))}
            </b>
          </span>
          <span>
            <small>GAP MEAN</small>
            <b>
              {(oracleMean - brickMean).toFixed(1)}
            </b>
          </span>
        </div>
      ) : (
        <div className="stat-line">
          <span>
            <small>P50</small>
            <b>{result.p50}</b>
          </span>
          <span>
            <small>P90</small>
            <b>{result.p90}</b>
          </span>
          <span>
            <small>RANGE</small>
            <b>
              {result.min}–{result.max}
            </b>
          </span>
        </div>
      )}
      {isTwoPass && (
        <div className="bar-legend" aria-hidden>
          <span className="is-brick">Fire brick</span>
          <span className="is-oracle">Oracle</span>
        </div>
      )}
      {result.cardStats && result.cardStats.length > 0 && (
        <CardStatsPanel
          stats={result.cardStats}
          samples={result.samples}
          mode={mode}
        />
      )}
      <div
        className={`damage-bars ${isTwoPass ? "is-two-pass" : ""} ${isMonteCarlo ? "is-monte-carlo" : ""}`}
        aria-label={
          isTwoPass
            ? "Two-pass brick and oracle damage by opening hand"
            : isMonteCarlo
              ? "Monte Carlo P50 damage with min–max range"
              : "Sample damage distribution"
        }
      >
        {isTwoPass
          ? twoPassPairs.map((pair, index) => (
              <button
                type="button"
                className={`bar-pair ${selected === index ? "is-selected" : ""}`}
                key={`two-pass-${pair.brick}-${pair.oracle}-${index}`}
                title={`Hand ${index + 1}: brick ${pair.brick} / oracle ${pair.oracle}`}
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected((current) => (current === index ? null : index));
                  setMcIndex(null);
                }}
              >
                <span
                  className="bar-pair-brick"
                  style={{
                    height: `${Math.max(8, (pair.brick / max) * 100)}%`,
                  }}
                />
                <span
                  className="bar-pair-oracle"
                  style={{
                    height: `${Math.max(8, (pair.oracle / max) * 100)}%`,
                  }}
                />
              </button>
            ))
          : isMonteCarlo
            ? mcRanges.map((range, index) => (
                <McRangeColumn
                  key={`mc-range-${range.min}-${range.max}-${index}`}
                  min={range.min}
                  max={range.max}
                  p50={range.p50}
                  scaleMax={max}
                  selected={selected === index}
                  title={`Hand ${index + 1}: P50 ${range.p50} (${range.min}–${range.max})`}
                  onClick={() => {
                    setSelected((current) =>
                      current === index ? null : index,
                    );
                    setMcIndex(null);
                  }}
                />
              ))
            : result.damages.map((damage, index) => (
                <button
                  type="button"
                  className={selected === index ? "is-selected" : undefined}
                  key={`${damage}-${index}`}
                  style={{ height: `${Math.max(8, (damage / max) * 100)}%` }}
                  title={`Hand ${index + 1}: ${damage} damage`}
                  aria-pressed={selected === index}
                  onClick={() => {
                    setSelected((current) =>
                      current === index ? null : index,
                    );
                    setMcIndex(null);
                  }}
                />
              ))}
      </div>

      {sample && (
        <div className="sample-detail">
          <div className="section-heading">
            <span>
              HAND {selected! + 1} ·{" "}
              {sample.twoPass
                ? `${sample.twoPass.brick.maxDamage} / ${sample.twoPass.oracle.maxDamage} DAMAGE`
                : sample.distribution
                  ? `${sample.distribution.min}–${sample.distribution.max} (P50 ${sample.distribution.p50})`
                  : `${sample.damage} DAMAGE`}
            </span>
            <strong>{sample.nodes.toLocaleString()} states</strong>
          </div>
          <div className="hand-strip sample-hand" aria-label="Sampled opening hand">
            {sample.hand.map((id, index) => (
              <div
                className={`card-tile is-${CARDS[id]?.element ?? "norm"}`}
                key={`${id}-${index}`}
              >
                <span>
                  {CARDS[id]?.element === "fire" ? "FIRE" : "NORM"}
                </span>
                <b>{CARDS[id]?.name ?? id}</b>
                <small>
                  {CARDS[id]?.cost ?? "?"}R · {CARDS[id]?.kind ?? "card"}
                </small>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="secondary-action send-to-solver"
            onClick={() => onSendToHandSolver(sample)}
          >
            Send to hand solver
          </button>

          {mode === "monte_carlo" && sample.distribution && (
            <MonteCarloSampleDetail
              distribution={sample.distribution}
              selected={mcIndex}
              onSelect={setMcIndex}
            />
          )}

          {mode === "two_pass" && sample.twoPass && (
            <TwoPassCompare
              brick={sample.twoPass.brick}
              oracle={sample.twoPass.oracle}
              compact
              resetKey={`deck-two-pass-${selected}`}
            />
          )}

          {mode === "fire_brick" && (
            <div className="combat-tape">
              <div className="tape-heading">
                <span>OPTIMAL LINE</span>
                <span>{sample.steps.length} steps</span>
              </div>
              <CombatTape
                steps={sample.steps}
                resetKey={`${selected}-${sample.damage}-${sample.nodes}`}
              />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

export function MonteCarloSampleDetail({
  distribution,
  selected,
  onSelect,
}: {
  distribution: DamageDistribution;
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const scaleMax = Math.max(distribution.max, 1);
  const rollout =
    selected !== null ? (distribution.rollouts[selected] ?? null) : null;

  return (
    <div className="mc-sample-block">
      <div className="damage-bars short" aria-label="Hand rollouts">
        {distribution.damages.map((damage, index) => (
          <button
            type="button"
            className={selected === index ? "is-selected" : undefined}
            key={`sample-mc-${damage}-${index}`}
            style={{ height: `${Math.max(8, (damage / scaleMax) * 100)}%` }}
            title={`Rollout ${index + 1}: ${damage}`}
            aria-pressed={selected === index}
            onClick={() =>
              onSelect(selected === index ? null : index)
            }
          />
        ))}
      </div>
      {rollout && (
        <div className="combat-tape">
          <div className="tape-heading">
            <span>
              ROLLOUT {selected! + 1} · {rollout.damage} DAMAGE
            </span>
            <span>{rollout.steps.length} steps</span>
          </div>
          <CombatTape
            steps={rollout.steps}
            resetKey={`sample-mc-${selected}-${rollout.damage}`}
          />
        </div>
      )}
    </div>
  );
}
