"use client";

import type { DamageDistribution, SimType } from "@/lib/engine";
import type { SampleHand } from "../types";
import { DamageBars, HandCard, OptimalLine, SectionHeading, TwoPassCompare } from "../ui";

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
      <DamageBars
        className="short"
        ariaLabel="Hand rollouts"
        scaleMax={scaleMax}
        selectedKey={selected != null ? String(selected) : null}
        onSelect={(key) => onSelect(key == null ? null : Number(key))}
        items={distribution.damages.map((damage, index) => ({
          key: String(index),
          damage,
          title: `Rollout ${index + 1}: ${damage}`,
        }))}
      />
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
      <SectionHeading
        title={
          <>
            HAND {handNumber} ·{" "}
            {sample.twoPass
              ? `${sample.twoPass.brick.maxDamage} / ${sample.twoPass.oracle.maxDamage} DAMAGE`
              : sample.distribution
                ? `${sample.distribution.min}–${sample.distribution.max} (P50 ${sample.distribution.p50})`
                : `${sample.damage} DAMAGE`}
          </>
        }
        meta={<strong>{sample.nodes.toLocaleString()} states</strong>}
      />
      <div className="hand-strip sample-hand" aria-label="Sampled opening hand">
        {sample.hand.map((id, index) => (
          <HandCard key={`${id}-${index}`} id={id} />
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
