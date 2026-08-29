"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SimType } from "@/lib/engine";
import type { DeckResult, SampleHand } from "../types";
import { LIVE_RUN_ID, type BarCardHighlight } from "./card-leaderboard";
import {
  PooledDamageBarChart,
  PooledSampleDetail,
  usePooledSampleSelection,
  type PooledSampleBar,
} from "./pooled-damage-bars";
import { cn } from "@/lib/utils/cn";
import { statSpanClass } from "@/lib/utils/stat-classes";
import { SectionHeading, StatLine } from "../ui";
import {
  damageMatchesRange,
  parseDamageRange,
  type DamageRange,
} from "../lib/damage-range";
import {
  formatOptionalStat,
  histogramFromDamages,
  meanOf,
  percentileFromValues,
} from "../lib/deck-stats";
import {
  historyBellPlotClass,
  historyCompareLegendClass,
  historyComparePairClass,
  historyCompareStatLineClass,
  historyDeltaClass,
  historyDeltaToneClass,
  historyPanelClass,
  historyPooledChartsClass,
  historyPooledChartsCompareClass,
  historyPooledHeadingClass,
  historyRangeClearClass,
  historyRangeFieldsClass,
  historyRangeFilterClass,
  historyRangeHintClass,
  historyRangeHintErrorClass,
} from "./history/shared";

const DamageBellCurve = dynamic(
  () =>
    import("./damage-bell-curve").then((module) => ({
      default: module.DamageBellCurve,
    })),
  { ssr: false },
);

export type { PooledSampleBar };

export type PooledDistribution = {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  meanEndInfluence?: number | null;
  buckets: number[];
  totalSamples?: number;
};

function formatSigned(value: number, digits = 1): string {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) {
    return `+${abs}`;
  }
  if (value < 0) {
    return `−${abs}`;
  }
  return digits === 0 ? "0" : (0).toFixed(digits);
}

function deltaToneClass(value: number) {
  return historyDeltaToneClass(value);
}

export function distributionFromDeckResult(
  result: DeckResult,
): PooledDistribution {
  const p10 = result.p10 ?? percentileFromValues(result.damages, 10);
  const meanEndInfluence =
    result.meanEndInfluence ??
    meanOf(result.hands.map((hand) => hand.endInfluence ?? 0));
  return {
    mean: result.mean,
    p10,
    p50: result.p50,
    p90: result.p90,
    min: result.min,
    max: result.max,
    meanEndInfluence,
    buckets: histogramFromDamages(result.damages),
    totalSamples: result.samples,
  };
}

export function sampleBarsFromDeckResult(result: DeckResult): PooledSampleBar[] {
  return result.damages.map((damage, index) => ({
    key: `live-${index}`,
    runId: LIVE_RUN_ID,
    sampleIndex: index,
    damage,
    label: `Hand ${index + 1}: ${damage} damage`,
    inspectable: true,
  }));
}

function CompareStatLine({
  baseline,
  compare,
}: {
  baseline: PooledDistribution;
  compare: PooledDistribution;
}) {
  return (
    <div className={historyCompareStatLineClass}>
      <span className={statSpanClass("mean")}>
        <small>MEAN</small>
        <b className={historyComparePairClass}>
          <em className="is-baseline">{baseline.mean.toFixed(1)}</em>
          <em className="is-compare">{compare.mean.toFixed(1)}</em>
        </b>
        <i className={cn(historyDeltaClass, deltaToneClass(compare.mean - baseline.mean))}>
          {formatSigned(compare.mean - baseline.mean, 1)}
        </i>
      </span>
      <span className={statSpanClass("p10")}>
        <small>P10</small>
        <b className={historyComparePairClass}>
          <em className="is-baseline">{baseline.p10}</em>
          <em className="is-compare">{compare.p10}</em>
        </b>
        <i className={cn(historyDeltaClass, deltaToneClass(compare.p10 - baseline.p10))}>
          {formatSigned(compare.p10 - baseline.p10, 0)}
        </i>
      </span>
      <span className={statSpanClass("p50")}>
        <small>P50</small>
        <b className={historyComparePairClass}>
          <em className="is-baseline">{baseline.p50}</em>
          <em className="is-compare">{compare.p50}</em>
        </b>
        <i className={cn(historyDeltaClass, deltaToneClass(compare.p50 - baseline.p50))}>
          {formatSigned(compare.p50 - baseline.p50, 0)}
        </i>
      </span>
      <span className={statSpanClass("p90")}>
        <small>P90</small>
        <b className={historyComparePairClass}>
          <em className="is-baseline">{baseline.p90}</em>
          <em className="is-compare">{compare.p90}</em>
        </b>
        <i className={cn(historyDeltaClass, deltaToneClass(compare.p90 - baseline.p90))}>
          {formatSigned(compare.p90 - baseline.p90, 0)}
        </i>
      </span>
      <span className={statSpanClass("range")}>
        <small>RANGE</small>
        <b className={historyComparePairClass}>
          <em className="is-baseline">
            {baseline.min}–{baseline.max}
          </em>
          <em className="is-compare">
            {compare.min}–{compare.max}
          </em>
        </b>
        <i className={cn(historyDeltaClass, "flex flex-wrap gap-x-3 gap-y-1.5")}>
          <span className={deltaToneClass(compare.min - baseline.min)}>
            min {formatSigned(compare.min - baseline.min, 0)}
          </span>
          <span className={deltaToneClass(compare.max - baseline.max)}>
            max {formatSigned(compare.max - baseline.max, 0)}
          </span>
        </i>
      </span>
      <span className={statSpanClass("influence")}>
        <small>END INF</small>
        <b className={historyComparePairClass}>
          <em className="is-baseline">
            {formatOptionalStat(baseline.meanEndInfluence, 1)}
          </em>
          <em className="is-compare">
            {formatOptionalStat(compare.meanEndInfluence, 1)}
          </em>
        </b>
        <i
          className={cn(
            historyDeltaClass,
            baseline.meanEndInfluence != null &&
              compare.meanEndInfluence != null
              ? deltaToneClass(
                  compare.meanEndInfluence - baseline.meanEndInfluence,
                )
              : "",
          )}
        >
          {baseline.meanEndInfluence != null &&
          compare.meanEndInfluence != null
            ? formatSigned(
                compare.meanEndInfluence - baseline.meanEndInfluence,
                1,
              )
            : "—"}
        </i>
      </span>
    </div>
  );
}

export function PooledDamagePanel({
  title = "POOLED DAMAGE",
  meta,
  children,
  distribution,
  compareDistribution,
  baselineLegend,
  compareLegend,
  bars,
  totalSampleBars,
  simType,
  cardHighlights,
  liveHands,
  showSendToSolver = false,
  onSendToHandSolver,
  resetKey,
  onAppliedRangeChange,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  distribution: PooledDistribution;
  compareDistribution?: PooledDistribution | null;
  baselineLegend?: string;
  compareLegend?: string;
  bars: PooledSampleBar[];
  totalSampleBars?: number;
  simType: SimType;
  cardHighlights?: Record<string, BarCardHighlight>;
  liveHands?: SampleHand[];
  showSendToSolver?: boolean;
  onSendToHandSolver?: (sample: SampleHand) => void;
  resetKey?: unknown;
  onAppliedRangeChange?: (range: DamageRange | null) => void;
}) {
  const comparing = Boolean(compareDistribution);
  const [damageMinText, setDamageMinText] = useState("");
  const [damageMaxText, setDamageMaxText] = useState("");
  const [appliedRange, setAppliedRange] = useState<DamageRange | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const parsedRange = useMemo(
    () => parseDamageRange(damageMinText, damageMaxText),
    [damageMinText, damageMaxText],
  );
  const liveRange = parsedRange.error ? appliedRange : parsedRange.range;
  const inRangeCount = useMemo(
    () =>
      bars.filter((bar) => damageMatchesRange(bar.damage, liveRange)).length,
    [bars, liveRange],
  );
  const dimmedBarKeys = useMemo(() => {
    if (!liveRange) {
      return undefined;
    }
    return new Set(
      bars
        .filter((bar) => !damageMatchesRange(bar.damage, liveRange))
        .map((bar) => bar.key),
    );
  }, [bars, liveRange]);
  const sampleMax = Math.max(distribution.max, 1);
  const selectedBar =
    selectedKey != null
      ? (bars.find((bar) => bar.key === selectedKey) ?? null)
      : null;
  const fetchRunId = liveHands ? null : (selectedBar?.runId ?? null);
  const fetchIndex = liveHands ? null : (selectedBar?.sampleIndex ?? null);
  const fetched = usePooledSampleSelection(fetchRunId, fetchIndex);
  const liveSample =
    liveHands && selectedBar
      ? (liveHands[selectedBar.sampleIndex] ?? null)
      : null;
  const sample = liveHands ? liveSample : fetched.sample;
  const loading = liveHands ? false : fetched.loading;
  const loadError = liveHands ? "" : fetched.loadError;
  const mcIndex = fetched.mcIndex;
  const setMcIndex = fetched.setMcIndex;

  useEffect(() => {
    setSelectedKey(null);
  }, [resetKey, bars.length, bars[0]?.key, bars.at(-1)?.key]);

  useEffect(() => {
    setMcIndex(null);
  }, [selectedKey, setMcIndex]);

  useEffect(() => {
    if (parsedRange.error) {
      return;
    }
    if (parsedRange.range == null) {
      setAppliedRange(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setAppliedRange(parsedRange.range);
    }, 280);
    return () => {
      window.clearTimeout(handle);
    };
  }, [parsedRange]);

  useEffect(() => {
    onAppliedRangeChange?.(appliedRange);
  }, [appliedRange, onAppliedRangeChange]);

  const rangeHint = parsedRange.error
    ? parsedRange.error
    : liveRange
      ? `${inRangeCount} of ${bars.length} samples`
      : null;

  return (
    <section className={cn(historyPanelClass, "mb-[18px]")}>
      <SectionHeading
        className={historyPooledHeadingClass}
        title={title}
        meta={meta}
      />
      {children}
      {comparing && compareDistribution ? (
        <>
          {(baselineLegend || compareLegend) && (
            <div className={historyCompareLegendClass} aria-hidden="true">
              <span className="is-baseline">{baselineLegend}</span>
              <span className="is-compare">{compareLegend}</span>
            </div>
          )}
          <CompareStatLine
            baseline={distribution}
            compare={compareDistribution}
          />
        </>
      ) : (
        <StatLine
          items={[
            { label: "MEAN", value: distribution.mean.toFixed(1) },
            { label: "P10", value: distribution.p10 },
            { label: "P50", value: distribution.p50 },
            { label: "P90", value: distribution.p90 },
            {
              label: "RANGE",
              value: (
                <>
                  {distribution.min}–{distribution.max}
                </>
              ),
            },
            {
              label: "END INF",
              value: formatOptionalStat(distribution.meanEndInfluence, 1),
            },
          ]}
        />
      )}

      <div className={historyRangeFilterClass}>
        <div className={historyRangeFieldsClass}>
          <label>
            Min
            <input
              type="number"
              inputMode="numeric"
              value={damageMinText}
              onChange={(event) => setDamageMinText(event.target.value)}
              placeholder="≥"
              autoComplete="off"
              aria-invalid={Boolean(parsedRange.error)}
              aria-describedby={rangeHint ? "pooled-range-hint" : undefined}
            />
          </label>
          <label>
            Max
            <input
              type="number"
              inputMode="numeric"
              value={damageMaxText}
              onChange={(event) => setDamageMaxText(event.target.value)}
              placeholder="≤"
              autoComplete="off"
              aria-invalid={Boolean(parsedRange.error)}
              aria-describedby={rangeHint ? "pooled-range-hint" : undefined}
            />
          </label>
          {(damageMinText !== "" || damageMaxText !== "") && (
            <button
              type="button"
              className={historyRangeClearClass}
              onClick={() => {
                setDamageMinText("");
                setDamageMaxText("");
              }}
            >
              Clear
            </button>
          )}
        </div>
        {rangeHint && (
          <p
            id="pooled-range-hint"
            className={cn(
              historyRangeHintClass,
              parsedRange.error && historyRangeHintErrorClass,
            )}
          >
            {rangeHint}
          </p>
        )}
      </div>

      <div
        className={cn(
          historyPooledChartsClass,
          comparing && historyPooledChartsCompareClass,
        )}
      >
        <div className={historyBellPlotClass}>
          {comparing && compareDistribution ? (
            <DamageBellCurve
              series={[
                {
                  id: "baseline",
                  buckets: distribution.buckets,
                  mean: distribution.mean,
                  p10: distribution.p10,
                  p50: distribution.p50,
                  p90: distribution.p90,
                  min: distribution.min,
                  max: distribution.max,
                },
                {
                  id: "compare",
                  buckets: compareDistribution.buckets,
                  mean: compareDistribution.mean,
                  p10: compareDistribution.p10,
                  p50: compareDistribution.p50,
                  p90: compareDistribution.p90,
                  min: compareDistribution.min,
                  max: compareDistribution.max,
                },
              ]}
              range={liveRange}
            />
          ) : (
            <DamageBellCurve
              buckets={distribution.buckets}
              mean={distribution.mean}
              p10={distribution.p10}
              p50={distribution.p50}
              p90={distribution.p90}
              min={distribution.min}
              max={distribution.max}
              range={liveRange}
            />
          )}
        </div>
        {!comparing && (
          <PooledDamageBarChart
            bars={bars}
            totalSamples={totalSampleBars}
            sampleMax={sampleMax}
            selectedKey={selectedKey}
            onSelectedKeyChange={setSelectedKey}
            cardHighlights={cardHighlights}
            dimmedKeys={dimmedBarKeys}
          />
        )}
      </div>
      {!comparing && (
        <PooledSampleDetail
          selectedBar={selectedBar}
          simType={simType}
          sample={sample}
          loading={loading}
          loadError={loadError}
          mcIndex={mcIndex}
          onMcIndexChange={setMcIndex}
          showSendToSolver={showSendToSolver}
          onSendToHandSolver={onSendToHandSolver}
        />
      )}
    </section>
  );
}
