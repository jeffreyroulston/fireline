"use client";

import { CARDS, type DamageDistribution, type SimType } from "@/lib/engine";
import type { SampleHand } from "../types";
import { OptimalLine, TwoPassCompare } from "../ui";

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
            onClick={() => onSelect(selected === index ? null : index)}
          />
        ))}
      </div>
      {rollout && (
        <OptimalLine
          label={`ROLLOUT ${selected! + 1} · ${rollout.damage} DAMAGE`}
          steps={rollout.steps}
          resetKey={`sample-mc-${selected}-${rollout.damage}`}
        />
      )}
    </div>
  );
}

export function SampleDetailPanel({
  sample,
  handNumber,
  mode,
  mcIndex,
  onMcIndexChange,
  onSendToHandSolver,
  showSendToSolver = true,
  resetKeyPrefix = "sample",
}: {
  sample: SampleHand;
  handNumber: number;
  mode: SimType;
  mcIndex: number | null;
  onMcIndexChange: (index: number | null) => void;
  onSendToHandSolver?: (sample: SampleHand) => void;
  showSendToSolver?: boolean;
  resetKeyPrefix?: string;
}) {
  return (
    <div className="sample-detail">
      <div className="section-heading">
        <span>
          HAND {handNumber} ·{" "}
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
            <span>{CARDS[id]?.element === "fire" ? "FIRE" : "NORM"}</span>
            <b>{CARDS[id]?.name ?? id}</b>
            <small>
              {CARDS[id]?.cost ?? "?"}R · {CARDS[id]?.kind ?? "card"}
            </small>
          </div>
        ))}
      </div>
      {showSendToSolver && onSendToHandSolver && (
        <button
          type="button"
          className="secondary-action send-to-solver"
          onClick={() => onSendToHandSolver(sample)}
        >
          Send to hand solver
        </button>
      )}

      {mode === "monte_carlo" && sample.distribution && (
        <MonteCarloSampleDetail
          distribution={sample.distribution}
          selected={mcIndex}
          onSelect={onMcIndexChange}
        />
      )}

      {mode === "two_pass" && sample.twoPass && (
        <TwoPassCompare
          brick={sample.twoPass.brick}
          oracle={sample.twoPass.oracle}
          compact
          resetKey={`${resetKeyPrefix}-two-pass-${handNumber}`}
        />
      )}

      {mode === "fire_brick" && sample.steps.length > 0 && (
        <OptimalLine
          sampleId={sample.sampleId}
          steps={sample.steps}
          resetKey={`${resetKeyPrefix}-${handNumber}-${sample.damage}-${sample.nodes}`}
        />
      )}
    </div>
  );
}
