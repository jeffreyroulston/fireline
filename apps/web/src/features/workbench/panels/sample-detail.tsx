"use client";

import type { ReactNode } from "react";
import type { CardId, DamageDistribution, LineEvent, SimType, SolveResult } from "@/lib/engine";
import type { SampleHand } from "../types";
import { cn, buttonVariants } from "@/lib/utils";
import { DamageBars, HandCard, OptimalLine, SectionHeading, TwoPassCompare } from "../ui";

function showsDrawnStrip(mode: SimType): boolean {
  return mode === "oracle_only" || mode === "monte_carlo";
}

function drawnCardIds(events: LineEvent[]): CardId[] {
  return events.flatMap((event) =>
    event.drawn ? [event.drawn as CardId] : [],
  );
}

function lineEventsForDrawn(
  sample: SampleHand,
  mode: SimType,
  mcIndex: number | null,
): LineEvent[] {
  if (mode === "monte_carlo" && mcIndex != null && sample.distribution) {
    return sample.distribution.rollouts[mcIndex]?.events ?? sample.events;
  }
  return sample.events;
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
    <div className="mt-5">
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
          events={rollout.events}
          resetKey={`sample-mc-${selected}-${rollout.damage}`}
        />
      )}
    </div>
  );
}

export function LineInspector({
  sample,
  handNumber,
  mode,
  mcIndex,
  onMcIndexChange,
  onSendToHandSolver,
  showSendToSolver = true,
  resetKeyPrefix = "sample",
  title,
}: {
  sample: SampleHand;
  handNumber?: number;
  mode: SimType;
  mcIndex: number | null;
  onMcIndexChange: (index: number | null) => void;
  onSendToHandSolver?: (sample: SampleHand) => void;
  showSendToSolver?: boolean;
  resetKeyPrefix?: string;
  title?: ReactNode;
}) {
  const showingMc = mode === "monte_carlo" && Boolean(sample.distribution);
  const showingTwoPass = mode === "two_pass" && Boolean(sample.twoPass);
  const drawn = showsDrawnStrip(mode)
    ? drawnCardIds(lineEventsForDrawn(sample, mode, mcIndex))
    : [];
  const damageLabel = sample.twoPass
    ? `${sample.twoPass.brick.maxDamage} / ${sample.twoPass.oracle.maxDamage} DAMAGE`
    : sample.distribution
      ? `${sample.distribution.min}–${sample.distribution.max} (P50 ${sample.distribution.p50})`
      : `${sample.damage} DAMAGE`;

  return (
    <div className="sample-detail mt-7 border-t border-border pt-6">
      <SectionHeading
        title={
          title ?? (
            <>
              {handNumber != null ? `HAND ${handNumber} · ` : ""}
              {damageLabel}
            </>
          )
        }
        meta={<strong>{sample.nodes.toLocaleString()} states</strong>}
      />
      <div className="pointer-events-none mb-3.5 grid min-h-0 grid-cols-7 gap-2" aria-label="Sampled opening hand">
        {sample.hand.map((id, index) => (
          <HandCard key={`${id}-${index}`} id={id} />
        ))}
      </div>
      {drawn.length > 0 && (
        <div className="mb-2">
          <SectionHeading
            className="mb-2.5"
            title="DRAWN"
            meta={<strong>{drawn.length} cards</strong>}
          />
          <div
            className="pointer-events-none mb-3.5 grid min-h-0 grid-cols-7 gap-2"
            aria-label="Cards drawn on the line"
          >
            {drawn.map((id, index) => (
              <HandCard key={`drawn-${id}-${index}`} id={id} />
            ))}
          </div>
        </div>
      )}
      {showSendToSolver && onSendToHandSolver && (
        <button
          type="button"
          className={cn(buttonVariants({ intent: "secondary" }), "mb-[22px]")}
          onClick={() => onSendToHandSolver(sample)}
        >
          Send to hand solver
        </button>
      )}

      {showingMc && sample.distribution && (
        <MonteCarloSampleDetail
          distribution={sample.distribution}
          selected={mcIndex}
          onSelect={onMcIndexChange}
        />
      )}

      {showingTwoPass && sample.twoPass && (
        <TwoPassCompare
          brick={sample.twoPass.brick}
          oracle={sample.twoPass.oracle}
          compact
          resetKey={`${resetKeyPrefix}-two-pass-${handNumber}`}
        />
      )}

      {!showingMc && !showingTwoPass && sample.events.length > 0 && (
        <OptimalLine
          sampleId={sample.sampleId}
          events={sample.events}
          resetKey={`${resetKeyPrefix}-${handNumber ?? "line"}-${sample.damage}-${sample.nodes}`}
        />
      )}
    </div>
  );
}

export function sampleFromSolveResult(
  result: SolveResult,
  hand: CardId[],
): SampleHand {
  return {
    hand,
    damage: result.maxDamage,
    endInfluence: result.endInfluence,
    events: result.events,
    nodes: Number(result.nodes),
    sampleId: result.sampleId,
    distribution: result.distribution,
    twoPass: result.twoPass,
  };
}
