"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import type { DamageRange } from "../lib/damage-range";

const EMBER = "#ec5a2a";
const EMBER_DARK = "#bc3519";
const ORACLE = "#2f6fed";
const ORACLE_DARK = "#1d4fbf";
const INK = "#102a30";
const MUTED = "#5e7377";

const POOLED_CHART_PLOT_HEIGHT = 252;
const POOLED_CHART_TICK_HEIGHT = 21;
const POOLED_CHART_TOTAL_HEIGHT =
  POOLED_CHART_PLOT_HEIGHT + POOLED_CHART_TICK_HEIGHT;
const CHART_MARGIN = { top: 27, right: 32, left: 0, bottom: POOLED_CHART_TICK_HEIGHT };
const X_AXIS_HEIGHT = POOLED_CHART_TICK_HEIGHT;
const KDE_POINT_COUNT = 56;

export interface DamageBellSeries {
  id: string;
  buckets: number[];
  mean: number;
  p10?: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
}

const SERIES_STYLE = {
  baseline: {
    stroke: EMBER_DARK,
    fill: EMBER,
    dash: undefined as string | undefined,
  },
  compare: {
    stroke: ORACLE_DARK,
    fill: ORACLE,
    dash: "5 3" as string | undefined,
  },
} as const;

function expandBuckets(buckets: number[]): number[] {
  return buckets.flatMap((count, damage) =>
    Array.from({ length: count }, () => damage),
  );
}

function kdeAt(
  values: number[],
  damage: number,
  bandwidth: number,
): number {
  const n = values.length;
  if (n === 0 || bandwidth <= 0) {
    return 0;
  }
  let density = 0;
  for (const value of values) {
    const z = (damage - value) / bandwidth;
    density += Math.exp(-0.5 * z * z);
  }
  return density / (n * bandwidth * Math.sqrt(2 * Math.PI));
}

function silvermanBandwidth(values: number[]): number {
  const n = values.length;
  if (n === 0) {
    return 1;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(n - 1, 1);
  const std = Math.sqrt(variance) || 1;
  return 1.06 * std * n ** -0.2;
}

function sharedKdeGrid(
  seriesList: Array<{ id: string; values: number[]; min: number; max: number }>,
  pointCount = KDE_POINT_COUNT,
): Array<Record<string, number>> {
  const active = seriesList.filter((entry) => entry.values.length > 0);
  if (active.length === 0) {
    return [];
  }

  const min = Math.min(...active.map((entry) => entry.min));
  const max = Math.max(...active.map((entry) => entry.max));
  const span = Math.max(max - min, 1);
  const left = min - span * 0.12;
  const right = max + span * 0.12;

  const bandwidths = new Map(
    active.map((entry) => [entry.id, silvermanBandwidth(entry.values)]),
  );

  const points: Array<Record<string, number>> = [];
  for (let index = 0; index <= pointCount; index += 1) {
    const damage = left + ((right - left) * index) / pointCount;
    const point: Record<string, number> = { damage };
    for (const entry of active) {
      point[entry.id] = kdeAt(
        entry.values,
        damage,
        bandwidths.get(entry.id) ?? 1,
      );
    }
    points.push(point);
  }
  return points;
}

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildXTicks(domain: [number, number]): number[] {
  const [lo, hi] = domain;
  const start = Math.ceil(lo);
  const end = Math.floor(hi);
  if (end < start) {
    return [Math.round(lo)];
  }
  const ticks: number[] = [];
  for (let value = start; value <= end; value += 1) {
    ticks.push(value);
  }
  return ticks;
}

function MarkerLabelBackground({
  viewBox,
  dy = 0,
  text,
  fill,
}: {
  viewBox?: { x?: number; y?: number };
  dy?: number;
  text: string;
  fill: string;
}) {
  const x = viewBox?.x ?? 0;
  const top = (viewBox?.y ?? 0) + dy;
  const fontSize = 9;
  const padX = 4;
  const padY = 2;
  const width = text.length * 5.4 + padX * 2;
  const height = fontSize + padY * 2;

  return (
    <g>
      <rect
        x={x - width / 2}
        y={top}
        width={width}
        height={height}
        fill="#fff"
        fillOpacity={0.92}
        rx={2}
      />
      <text
        x={x}
        y={top + padY + fontSize - 1}
        textAnchor="middle"
        fill={fill}
        fontSize={fontSize}
        fontFamily="IBM Plex Mono"
      >
        {text}
      </text>
    </g>
  );
}

function toSeriesList(props: {
  buckets?: number[];
  mean?: number;
  p10?: number;
  p50?: number;
  p90?: number;
  min?: number;
  max?: number;
  series?: DamageBellSeries[];
}): DamageBellSeries[] {
  if (props.series && props.series.length > 0) {
    return props.series;
  }
  if (
    props.buckets &&
    props.mean != null &&
    props.p50 != null &&
    props.p90 != null &&
    props.min != null &&
    props.max != null
  ) {
    return [
      {
        id: "baseline",
        buckets: props.buckets,
        mean: props.mean,
        p10: props.p10,
        p50: props.p50,
        p90: props.p90,
        min: props.min,
        max: props.max,
      },
    ];
  }
  return [];
}

export function DamageBellCurve({
  buckets,
  mean,
  p10,
  p50,
  p90,
  min,
  max,
  series: seriesProp,
  range = null,
}: {
  buckets?: number[];
  mean?: number;
  p10?: number;
  p50?: number;
  p90?: number;
  min?: number;
  max?: number;
  series?: DamageBellSeries[];
  range?: DamageRange | null;
}) {
  const gradientBase = useId().replace(/:/g, "");
  const seriesList = useMemo(
    () => toSeriesList({ buckets, mean, p10, p50, p90, min, max, series: seriesProp }),
    [buckets, mean, p10, p50, p90, min, max, seriesProp],
  );
  const overlay = seriesList.length > 1;

  const data = useMemo(
    () =>
      sharedKdeGrid(
        seriesList.map((entry) => ({
          id: entry.id,
          values: expandBuckets(entry.buckets),
          min: entry.min,
          max: entry.max,
        })),
      ),
    [seriesList],
  );

  const domain = useMemo(() => {
    if (seriesList.length === 0) {
      return [0, 1] as [number, number];
    }
    const lo = Math.min(...seriesList.map((entry) => entry.min));
    const hi = Math.max(...seriesList.map((entry) => entry.max));
    return [Math.floor(lo - 1), Math.ceil(hi + 1)] as [number, number];
  }, [seriesList]);

  const xTicks = useMemo(() => buildXTicks(domain), [domain]);

  if (data.length === 0 || seriesList.length === 0) {
    return null;
  }

  const baseline = seriesList[0]!;
  const compare = seriesList[1];

  const markers = overlay
    ? [
        {
          key: "mean-baseline",
          label: "MEAN A",
          value: baseline.mean,
          stroke: EMBER_DARK,
          dash: undefined as string | undefined,
          opacity: 0.45,
        },
        ...(compare
          ? [
              {
                key: "mean-compare",
                label: "MEAN B",
                value: compare.mean,
                stroke: ORACLE_DARK,
                dash: "4 4" as string | undefined,
                opacity: 0.45,
              },
            ]
          : []),
      ]
    : [
        {
          key: "mean",
          label: "MEAN",
          value: baseline.mean,
          stroke: INK,
          dash: undefined as string | undefined,
          opacity: 0.4,
        },
        ...(baseline.p10 != null
          ? [
              {
                key: "p10",
                label: "P10",
                value: baseline.p10,
                stroke: MUTED,
                dash: "4 4" as string | undefined,
                opacity: 0.22,
              },
            ]
          : []),
        {
          key: "p50",
          label: "P50",
          value: baseline.p50,
          stroke: MUTED,
          dash: "4 4" as string | undefined,
          opacity: 0.22,
        },
        {
          key: "p90",
          label: "P90",
          value: baseline.p90,
          stroke: MUTED,
          dash: "4 4" as string | undefined,
          opacity: 0.22,
        },
      ];

  const rangeMarkers = [
    range?.gte != null
      ? {
          key: "range-min",
          label: "MIN",
          value: range.gte,
        }
      : null,
    range?.lte != null
      ? {
          key: "range-max",
          label: "MAX",
          value: range.lte,
        }
      : null,
  ].filter((marker) => marker != null);

  return (
    <div className="damage-bell-curve w-full max-w-[520px] pt-1">
      <ResponsiveContainer width="100%" height={POOLED_CHART_TOTAL_HEIGHT}>
        <AreaChart data={data} margin={CHART_MARGIN}>
          <defs>
            {seriesList.map((entry, index) => {
              const style =
                index === 0 ? SERIES_STYLE.baseline : SERIES_STYLE.compare;
              const gradientId = `${gradientBase}-${entry.id}`;
              return (
                <linearGradient
                  key={gradientId}
                  id={gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={style.fill}
                    stopOpacity={overlay ? 0.22 : 0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor={style.fill}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              );
            })}
          </defs>

          <XAxis
            dataKey="damage"
            type="number"
            domain={domain}
            ticks={xTicks}
            axisLine={{ stroke: INK, strokeWidth: 1 }}
            tickLine={false}
            tick={{
              fill: MUTED,
              fontSize: 9,
              fontFamily: "IBM Plex Mono",
              dy: 4,
            }}
            tickFormatter={formatTick}
            interval={0}
            height={X_AXIS_HEIGHT}
            padding={{ left: 4, right: 12 }}
          />
          <YAxis hide domain={[0, "auto"]} />

          {seriesList.map((entry, index) => {
            const style =
              index === 0 ? SERIES_STYLE.baseline : SERIES_STYLE.compare;
            const gradientId = `${gradientBase}-${entry.id}`;
            return (
              <Area
                key={entry.id}
                type="monotone"
                dataKey={entry.id}
                stroke={style.stroke}
                strokeWidth={1.5}
                strokeDasharray={style.dash}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
            );
          })}

          {markers.map((marker) => (
            <ReferenceLine
              key={marker.key}
              x={marker.value}
              stroke={marker.stroke}
              strokeDasharray={marker.dash}
              strokeOpacity={marker.opacity}
              strokeWidth={1}
              label={
                marker.label === "MEAN" ||
                marker.label === "MEAN A" ||
                marker.label === "MEAN B"
                  ? (props) => (
                      <MarkerLabelBackground
                        viewBox={props.viewBox}
                        dy={5}
                        text={marker.label}
                        fill={marker.stroke}
                      />
                    )
                  : {
                      value: marker.label,
                      position: "top" as const,
                      dy: 0,
                      fill: MUTED,
                      fontSize: 9,
                      fontFamily: "IBM Plex Mono",
                    }
              }
            />
          ))}
          {rangeMarkers.map((marker) => (
            <ReferenceLine
              key={marker.key}
              x={marker.value}
              stroke={EMBER_DARK}
              strokeOpacity={0.85}
              strokeWidth={1.25}
              label={(props) => (
                <MarkerLabelBackground
                  viewBox={props.viewBox}
                  dy={18}
                  text={marker.label}
                  fill={EMBER_DARK}
                />
              )}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
