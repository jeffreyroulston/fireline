"use client";

import { cn } from "@/lib/utils";
import { InfoPopover } from "@/components/info-popover";
import type { CardDatabasePerformance } from "@/lib/api/client";
import { formatDmg, formatLift, formatPct } from "./formatters";
import {
  cardDbEmptyClass,
  cardDbStatsClass,
  cardDbStatsDdClass,
  cardDbStatsDtClass,
  cardDbStatsHandClass,
  cardDbStatsItemClass,
  partnerDeltaClass,
} from "./shared";

export interface PerformanceBlockProps {
  readonly performance: CardDatabasePerformance | null;
  readonly swapSweep?: boolean;
}

export function PerformanceBlock({
  performance,
  swapSweep = false,
}: PerformanceBlockProps) {
  if (!performance) {
    return (
      <p className={cardDbEmptyClass}>No performance data for this version.</p>
    );
  }
  return (
    <>
      {performance.handLift != null ? (
        <dl className={cn(cardDbStatsClass, cardDbStatsHandClass)}>
          <div className={cardDbStatsItemClass}>
            <dt className={cardDbStatsDtClass}>
              {swapSweep ? "Across swap sims" : "In opening hand"}
            </dt>
            <dd className={cardDbStatsDdClass}>
              {formatDmg(performance.withHandMean ?? 0)}
            </dd>
          </div>
          <div className={cardDbStatsItemClass}>
            <dt className={cardDbStatsDtClass}>
              {swapSweep ? "Baseline sim" : "Not in opening hand"}
            </dt>
            <dd className={cardDbStatsDdClass}>
              {formatDmg(performance.withoutHandMean ?? 0)}
            </dd>
          </div>
          <div className={cardDbStatsItemClass}>
            <dt className={cardDbStatsDtClass}>Lift</dt>
            <dd className={cardDbStatsDdClass}>
              <span className={partnerDeltaClass(performance.handLift)}>
                {formatLift(performance.handLift)}
              </span>
            </dd>
          </div>
          <div className={cardDbStatsItemClass}>
            <dt className={cardDbStatsDtClass}>
              <InfoPopover label="Samples">
                {swapSweep
                  ? "Weighted samples from swap variants / baseline sims."
                  : "Opening-hand samples with this card in hand / without."}
              </InfoPopover>
            </dt>
            <dd className={cardDbStatsDdClass}>
              {performance.withHandSamples.toLocaleString()} /{" "}
              {performance.withoutHandSamples.toLocaleString()}
            </dd>
          </div>
        </dl>
      ) : (
        <p className={cardDbEmptyClass}>
          {swapSweep
            ? "No lift vs baseline across swap sims yet."
            : "Not enough opening-hand samples for with/without comparison (need at least 5 in each bucket)."}
        </p>
      )}
      <dl className={cardDbStatsClass}>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>See %</dt>
          <dd className={cardDbStatsDdClass}>{formatPct(performance.seeRate)}</dd>
        </div>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>Open %</dt>
          <dd className={cardDbStatsDdClass}>{formatPct(performance.openRate)}</dd>
        </div>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>Play|hand %</dt>
          <dd className={cardDbStatsDdClass}>
            {formatPct(performance.playWhenInHand)}
          </dd>
        </div>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>Dmg|seen</dt>
          <dd className={cardDbStatsDdClass}>
            {formatDmg(performance.damageWhenSeen)}
          </dd>
        </div>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>Plays</dt>
          <dd className={cardDbStatsDdClass}>
            {performance.plays.toLocaleString()}
          </dd>
        </div>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>Damage</dt>
          <dd className={cardDbStatsDdClass}>
            {performance.damage.toLocaleString()}
          </dd>
        </div>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>Runs</dt>
          <dd className={cardDbStatsDdClass}>{performance.runCount}</dd>
        </div>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>Decks</dt>
          <dd className={cardDbStatsDdClass}>{performance.deckCount}</dd>
        </div>
        <div className={cardDbStatsItemClass}>
          <dt className={cardDbStatsDtClass}>Samples</dt>
          <dd className={cardDbStatsDdClass}>
            {performance.eligibleSamples.toLocaleString()}
          </dd>
        </div>
      </dl>
    </>
  );
}
