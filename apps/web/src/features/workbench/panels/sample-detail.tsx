"use client";

import type { ReactNode } from "react";
import type { CardId, DamageDistribution, LineEvent, SimType, SolveResult } from "@/lib/engine";
import { SIM_TYPE_LABELS, type SampleHand } from "../types";
import { cn, buttonVariants } from "@/lib/utils";
import {
  consumePlayedSlots,
  playCountsFromEvents,
} from "../lib/played-hand-slots";
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

function openingDrawId(events: LineEvent[]): CardId | null {
  const start = events.find((event) => event.kind === "start");
  return start?.drawn ? (start.drawn as CardId) : null;
}

function drawnCardIds(events: LineEvent[]): CardId[] {
  return events.flatMap((event) =>
    event.drawn ? [event.drawn as CardId] : [],
  );
}

function handStripClass(count: number): string {
  return cn(
    "pointer-events-none mb-3.5 grid min-h-0 gap-2",
    count >= 8 ? "grid-cols-8" : "grid-cols-7",
  );
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

/** Rollout damage bars only — no per-rollout line inspector. */
export function MonteCarloSampleDetail({
  distribution,
}: {
  distribution: DamageDistribution;
}) {
  const scaleMax = Math.max(distribution.max, 1);

  return (
    <div className="mt-5">
      <DamageBars
        className="short"
        ariaLabel="Hand rollouts"
        scaleMax={scaleMax}
        items={distribution.damages.map((damage, index) => ({
          key: String(index),
          damage,
          title: `Rollout ${index + 1}: ${damage}`,
          disabled: true,
        }))}
      />
    </div>
  );
}

export function LineInspector({
  sample,
  handNumber,
  mode,
  onSendToHandSolver,
  showSendToSolver = true,
  showDamageReadout = true,
  resetKeyPrefix = "sample",
  title,
  highlightCardId = null,
}: {
  sample: SampleHand;
  handNumber?: number;
  mode: SimType;
  onSendToHandSolver?: (sample: SampleHand) => void;
  showSendToSolver?: boolean;
  showDamageReadout?: boolean;
  resetKeyPrefix?: string;
  title?: ReactNode;
  highlightCardId?: string | null;
}) {
  const showingMc = mode === "monte_carlo" && Boolean(sample.distribution);
  const showingTwoPass = mode === "two_pass" && Boolean(sample.twoPass);
  const lineEvents = sample.events;
  const openingDraw =
    mode === "fire_brick" ? openingDrawId(lineEvents) : null;
  const displayedHand =
    openingDraw != null ? [...sample.hand, openingDraw] : sample.hand;
  const drawn = showsDrawnStrip(mode) ? drawnCardIds(lineEvents) : [];
  const remainingPlays = playCountsFromEvents(lineEvents);
  const handPlayed = consumePlayedSlots(displayedHand, remainingPlays);
  const drawnPlayed = consumePlayedSlots(drawn, remainingPlays);
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
      <div
        className={handStripClass(displayedHand.length)}
        aria-label="Sampled opening hand"
      >
        {displayedHand.map((id, index) => (
          <HandCard
            key={`${id}-${index}`}
            id={id}
            faded={!handPlayed[index]}
          />
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
            className={handStripClass(drawn.length)}
            aria-label="Cards drawn on the line"
          >
            {drawn.map((id, index) => (
              <HandCard
                key={`drawn-${id}-${index}`}
                id={id}
                faded={!drawnPlayed[index]}
              />
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
        <MonteCarloSampleDetail distribution={sample.distribution} />
      )}

      {showingTwoPass && sample.twoPass && (
        <TwoPassCompare
          brick={sample.twoPass.brick}
          oracle={sample.twoPass.oracle}
          compact
          resetKey={`${resetKeyPrefix}-two-pass-${handNumber}`}
        />
      )}

      {!showingTwoPass && sample.events.length > 0 && (
        <OptimalLine
          sampleId={sample.sampleId}
          events={sample.events}
          resetKey={`${resetKeyPrefix}-${handNumber ?? "line"}-${sample.damage}-${sample.nodes}`}
          highlightCardId={highlightCardId}
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
