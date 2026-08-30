"use client";

import type { ReactNode } from "react";
import type { CardId, DamageDistribution, LineEvent, SimType, SolveResult } from "@/lib/engine";
import { SIM_TYPE_LABELS, type SampleHand } from "../types";
import { cn, buttonVariants } from "@/lib/utils";
import {
  DamageBars,
  DamageReadout,
  HandCard,
  OptimalLine,
  SectionHeading,
  TwoPassCompare,
} from "../ui";

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

function sampleDamageReadout(
  sample: SampleHand,
  mode: SimType,
  handNumber?: number,
): { label: string; value: ReactNode; detail: ReactNode } {
  const states = `${sample.nodes.toLocaleString()} states`;
  const handPrefix = handNumber != null ? `HAND ${handNumber}` : null;

  if (sample.twoPass) {
    return {
      label: handPrefix ?? "TWO-PASS",
      value: (
        <>
          {sample.twoPass.brick.maxDamage}
          <span className="mx-[0.08em] font-medium text-muted">/</span>
          {sample.twoPass.oracle.maxDamage}
        </>
      ),
      detail: (
        <>
          {handPrefix ? "Brick / Oracle · " : ""}
          {states}
        </>
      ),
    };
  }

  if (sample.distribution) {
    return {
      label: handPrefix ?? "P50 DAMAGE",
      value: sample.distribution.p50,
      detail: (
        <>
          {sample.distribution.min}–{sample.distribution.max} range · {states}
        </>
      ),
    };
  }

  return {
    label: handPrefix ?? "MAX DAMAGE",
    value: sample.damage,
    detail: (
      <>
        {SIM_TYPE_LABELS[mode]} · {states}
      </>
    ),
  };
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
        <>
          <div className="mt-5">
            <DamageReadout
              size="lg"
              label={`ROLLOUT ${selected! + 1}`}
              value={rollout.damage}
              detail="DAMAGE"
            />
          </div>
          {rollout.events.length > 0 ? (
            <OptimalLine
              label={`ROLLOUT ${selected! + 1}`}
              events={rollout.events}
              resetKey={`sample-mc-${selected}-${rollout.damage}`}
            />
          ) : (
            <p className="mt-3 font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
              Rollout line tapes are omitted from deck evaluations. The P50
              headline tape is kept on the sample; re-run this hand in the line
              solver for full Monte Carlo tapes.
            </p>
          )}
        </>
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
  showDamageReadout = true,
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
  showDamageReadout?: boolean;
  resetKeyPrefix?: string;
  title?: ReactNode;
}) {
  const showingMc = mode === "monte_carlo" && Boolean(sample.distribution);
  const showingTwoPass = mode === "two_pass" && Boolean(sample.twoPass);
  const drawn = showsDrawnStrip(mode)
    ? drawnCardIds(lineEventsForDrawn(sample, mode, mcIndex))
    : [];
  const readout = sampleDamageReadout(sample, mode, handNumber);

  return (
    <div className="sample-detail mt-7 border-t border-border pt-6">
      {showDamageReadout ? (
        <div className="mb-5">
          <DamageReadout
            size="lg"
            label={readout.label}
            value={readout.value}
            detail={readout.detail}
          />
        </div>
      ) : (
        <SectionHeading
          title={title ?? (handNumber != null ? `HAND ${handNumber}` : "OPENING HAND")}
          meta={<strong>{sample.nodes.toLocaleString()} states</strong>}
        />
      )}
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
