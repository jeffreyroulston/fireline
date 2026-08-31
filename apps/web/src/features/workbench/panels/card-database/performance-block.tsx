"use client";

import { cn } from "@/lib/utils";
import { InfoPopover } from "@/components/info-popover";
import type {
  CardDatabasePerformance,
  CardDatabaseSource,
} from "@/lib/api/client";
import { deltaTone, formatDmg, formatLift, formatPct } from "./formatters";
import {
  cardDbEmptyClass,
  cardDbStatsClass,
  cardDbStatsDdClass,
  cardDbStatsDtClass,
  cardDbStatsHandClass,
  cardDbStatsItemClass,
} from "./shared";

export interface PerformanceBlockProps {
  readonly performance: CardDatabasePerformance | null;
  readonly source?: CardDatabaseSource;
}

export function PerformanceBlock({
  performance,
  source,
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
            <dt className={cardDbStatsDtClass}>In opening hand</dt>
            <dd className={cardDbStatsDdClass}>
              {formatDmg(performance.withHandMean ?? 0)}
            </dd>
          </div>
          <div className={cardDbStatsItemClass}>
            <dt className={cardDbStatsDtClass}>Not in opening hand</dt>
            <dd className={cardDbStatsDdClass}>
              {formatDmg(performance.withoutHandMean ?? 0)}
            </dd>
          </div>
          <div className={cardDbStatsItemClass}>
            <dt className={cardDbStatsDtClass}>Lift</dt>
            <dd
              className={cn(
                cardDbStatsDdClass,
                deltaTone(performance.handLift),
              )}
            >
              {formatLift(performance.handLift)}
            </dd>
          </div>
          <div className={cardDbStatsItemClass}>
            <dt className={cardDbStatsDtClass}>
              <InfoPopover label="Samples">
                Opening-hand samples with this card in hand / without.
              </InfoPopover>
            </dt>
            <dd className={cardDbStatsDdClass}>
              {performance.withHandSamples.toLocaleString()} /{" "}
              {performance.withoutHandSamples.toLocaleString()}
            </dd>
          </div>
        </dl>
      ) : source === "swap_sweep" &&
        performance.eligibleSamples > 0 &&
        performance.withHandSamples === 0 &&
        performance.withoutHandSamples === 0 ? (
        <p className={cardDbEmptyClass}>
          Opening-hand lift was not stored on this swap-sweep run. Re-run it to
          populate with/without damage.
        </p>
      ) : (
        <p className={cardDbEmptyClass}>
          Not enough opening-hand samples for with/without comparison (need at
          least 5 in each bucket
          {performance.withHandSamples > 0 ||
          performance.withoutHandSamples > 0
            ? `; have ${performance.withHandSamples.toLocaleString()} / ${performance.withoutHandSamples.toLocaleString()}`
            : ""}
          ).
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
