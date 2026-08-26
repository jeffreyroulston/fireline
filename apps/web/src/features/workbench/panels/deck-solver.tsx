"use client";

import { useEffect, useState } from "react";
import { type SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { DamageBars, DamageReadout, DeckPicker, McRangeColumn, RunSettings, ActionBar, SectionHeading, StatLine } from "../ui";
import {
  CardLeaderboardPanel,
  leaderboardFromCardStats,
} from "./card-leaderboard";
import { SampleDetailPanel } from "./sample-detail";
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
          />
        </div>
        <p className="deck-select-hint">
          Manage and edit lists on the Decks tab. This tab only runs damage
          samples.
        </p>
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
        <DamageReadout
          label="EXPECTED DAMAGE"
          value="—"
          detail="Sample opening hands to build the distribution"
          calculating={busy}
        />
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
      <DamageReadout
        label={isTwoPass ? "BRICK / ORACLE MEAN" : "MEAN DAMAGE"}
        value={
          isTwoPass ? (
            <>
              {brickMean.toFixed(1)}
              <span className="damage-split">/</span>
              {oracleMean.toFixed(1)}
            </>
          ) : (
            result.mean.toFixed(1)
          )
        }
        detail={
          <>
            {SIM_TYPE_LABELS[mode]} · {result.samples} opening hands · click a
            bar for the line
          </>
        }
      />
      {isTwoPass ? (
        <StatLine
          items={[
            {
              label: "BRICK RANGE",
              value: (
                <>
                  {Math.min(...twoPassPairs.map((p) => p.brick))}–
                  {Math.max(...twoPassPairs.map((p) => p.brick))}
                </>
              ),
            },
            {
              label: "ORACLE RANGE",
              value: (
                <>
                  {Math.min(...twoPassPairs.map((p) => p.oracle))}–
                  {Math.max(...twoPassPairs.map((p) => p.oracle))}
                </>
              ),
            },
            {
              label: "GAP MEAN",
              value: (oracleMean - brickMean).toFixed(1),
            },
          ]}
        />
      ) : (
        <StatLine
          items={[
            { label: "P50", value: result.p50 },
            { label: "P90", value: result.p90 },
            {
              label: "RANGE",
              value: (
                <>
                  {result.min}–{result.max}
                </>
              ),
            },
          ]}
        />
      )}
      {isTwoPass && (
        <div className="bar-legend" aria-hidden>
          <span className="is-brick">Fire brick</span>
          <span className="is-oracle">Oracle</span>
        </div>
      )}
      {result.cardStats && result.cardStats.length > 0 && (
        <CardLeaderboardPanel
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
                  ),
                  brick: leaderboardFromCardStats(
                    result.brickCardStats,
                    result.samples,
                  ),
                  oracle: leaderboardFromCardStats(
                    result.oracleCardStats,
                    result.samples,
                  ),
                },
              }
            : {
                leaderboard: leaderboardFromCardStats(
                  result.cardStats,
                  result.samples,
                ),
              })}
        />
      )}
      <div className="damage-bars-scroll">
        {isTwoPass || isMonteCarlo ? (
          <div
            className={`damage-bars ${isTwoPass ? "is-two-pass" : ""} ${isMonteCarlo ? "is-monte-carlo" : ""}`}
            aria-label={
              isTwoPass
                ? "Two-pass brick and oracle damage by opening hand"
                : "Monte Carlo P50 damage with min–max range"
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
                      setSelected((current) =>
                        current === index ? null : index,
                      );
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
              : mcRanges.map((range, index) => (
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
                ))}
          </div>
        ) : (
          <DamageBars
            ariaLabel="Sample damage distribution"
            scaleMax={max}
            selectedKey={selected != null ? String(selected) : null}
            onSelect={(key) => {
              setSelected(key == null ? null : Number(key));
              setMcIndex(null);
            }}
            items={result.damages.map((damage, index) => ({
              key: String(index),
              damage,
              title: `Hand ${index + 1}: ${damage} damage`,
            }))}
          />
        )}
      </div>

      {sample && (
        <SampleDetailPanel
          sample={sample}
          handNumber={selected! + 1}
          mode={mode}
          mcIndex={mcIndex}
          onMcIndexChange={setMcIndex}
          onSendToHandSolver={onSendToHandSolver}
          resetKeyPrefix={`deck-${selected}`}
        />
      )}
    </aside>
  );
}
