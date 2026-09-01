"use client";

import { useEffect, useRef, useState } from "react";
import type { CardId, SimType } from "@/lib/engine";
import { fetchPooledSample } from "@/lib/api/client";
import type { SampleHand } from "../types";
import { cn } from "@/lib/utils/cn";
import type { BarCardHighlight } from "./card-leaderboard";
import { LineInspector } from "./sample-detail";
import { DamageBars } from "../ui";
import {
  errorBannerClass,
  simHintClass,
} from "./history/shared";

export interface PooledSampleBar {
  key: string;
  runId: string;
  sampleIndex: number;
  damage: number;
  label: string;
  /** When set, overrides `Boolean(runId)` for whether the bar can be inspected. */
  inspectable?: boolean;
}

/** Max individual sample bars to render in pooled/history charts. */
export const MAX_POOLED_SAMPLE_BARS = 200;

export function limitRecentPooledBars(
  bars: PooledSampleBar[],
  limit = MAX_POOLED_SAMPLE_BARS,
): { bars: PooledSampleBar[]; total: number } {
  const total = bars.length;
  if (total <= limit) {
    return { bars, total };
  }
  return { bars: bars.slice(-limit), total };
}

export function usePooledSampleSelection(
  runId: string | null,
  sampleIndex: number | null,
) {
  const [sample, setSample] = useState<SampleHand | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!runId || sampleIndex == null) {
      setSample(null);
      setLoading(false);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void (async () => {
      try {
        const result = await fetchPooledSample({ runId, sampleIndex });
        if (cancelled) {
          return;
        }
        setSample({
          hand: result.hand as CardId[],
          damage: result.damage,
          events: result.events,
          nodes: result.nodes,
          sampleId: result.sampleId,
        });
      } catch (error) {
        if (!cancelled) {
          setSample(null);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load sample details.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, sampleIndex]);

  return { sample, loading, loadError };
}

const historyBarsPanelClass =
  "flex h-[var(--pooled-chart-total-height,273px)] min-w-0 flex-col";

const historyBarsScrollClass =
  "mx-[-6px] my-2 flex h-[var(--pooled-chart-total-height,273px)] flex-[1_1_var(--pooled-chart-total-height,273px)] flex-col overflow-x-auto overflow-y-hidden px-1.5 pb-3 [scrollbar-gutter:stable] [scrollbar-color:color-mix(in_srgb,var(--color-foreground)_35%,transparent)_transparent]";

const historyBarsChartClass =
  "short mt-2 min-w-full gap-[3px] mb-[var(--pooled-chart-tick-height,21px)] h-[var(--pooled-chart-plot-height,252px)] flex-[0_0_var(--pooled-chart-plot-height,252px)] box-border [&>button]:block [&>button]:min-w-[11px] [&>button]:flex-[1_0_11px]";

function historyBarClass(
  dimmed: boolean,
  highlight: BarCardHighlight | undefined,
  selected: boolean,
): string | undefined {
  if (dimmed) {
    return cn(
      "bg-gradient-to-b from-[color-mix(in_srgb,var(--color-foreground)_18%,var(--color-surface-muted))] to-[color-mix(in_srgb,var(--color-foreground)_32%,var(--color-surface-deep))] opacity-[0.42] shadow-none hover:brightness-100",
      selected &&
        "opacity-[0.72] shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-foreground)_55%,transparent)]",
    );
  }
  if (highlight === "in_hand") {
    return cn(
      "bg-gradient-to-b from-[#e8dcc8] to-[#b8a588] hover:brightness-[1.08]",
      selected &&
        "bg-gradient-to-b from-[#f0e2c8] to-[#c4ad80] shadow-[inset_0_0_0_2px_var(--color-foreground)]",
    );
  }
  if (highlight === "played") {
    return cn(
      "bg-gradient-to-b from-[#8fd8ae] to-[#3d9970] hover:brightness-[1.08]",
      selected &&
        "bg-gradient-to-b from-[#a8e8c4] to-[#4aad78] shadow-[inset_0_0_0_2px_var(--color-foreground)]",
    );
  }
  return undefined;
}

export function PooledDamageBarChart({
  bars,
  totalSamples,
  sampleMax,
  selectedKey,
  onSelectedKeyChange,
  cardHighlights = {},
  dimmedKeys,
}: {
  bars: PooledSampleBar[];
  totalSamples?: number;
  sampleMax: number;
  selectedKey: string | null;
  onSelectedKeyChange: (key: string | null) => void;
  cardHighlights?: Record<string, BarCardHighlight>;
  dimmedKeys?: ReadonlySet<string>;
}) {
  return (
    <div className={historyBarsPanelClass}>
      <div className={historyBarsScrollClass} aria-label="Pooled sample damage">
        <DamageBars
          className={historyBarsChartClass}
          scaleMax={sampleMax}
          selectedKey={selectedKey}
          onSelect={onSelectedKeyChange}
          items={bars.map((bar) => {
            const cardHighlight = cardHighlights[bar.key];
            const dimmed = dimmedKeys?.has(bar.key) ?? false;
            const selected = selectedKey === bar.key;
            return {
              key: bar.key,
              damage: bar.damage,
              title: bar.label,
              disabled: !(bar.inspectable ?? Boolean(bar.runId)),
              className: historyBarClass(dimmed, cardHighlight, selected),
            };
          })}
        />
      </div>
      <p className={simHintClass}>
        {totalSamples != null && totalSamples > bars.length
          ? `Showing ${bars.length.toLocaleString()} most recent of ${totalSamples.toLocaleString()} samples. `
          : ""}
        Click a bar to inspect the optimal line for that opening hand.
      </p>
    </div>
  );
}

export function PooledSampleDetail({
  selectedBar,
  simType,
  sample,
  loading,
  loadError,
  showSendToSolver = false,
  onSendToHandSolver,
  resetKeyPrefix,
  highlightCardId = null,
}: {
  selectedBar: PooledSampleBar | null;
  simType: SimType;
  sample: SampleHand | null;
  loading: boolean;
  loadError: string;
  showSendToSolver?: boolean;
  onSendToHandSolver?: (sample: SampleHand) => void;
  resetKeyPrefix?: string;
  highlightCardId?: string | null;
}) {
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sample && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [sample, selectedBar?.key]);

  if (!selectedBar) {
    return null;
  }

  return (
    <div className="mt-4 [&_.sample-detail]:mt-0" ref={detailRef}>
      {loading && <p className={simHintClass}>Loading sample…</p>}
      {loadError && (
        <p className={errorBannerClass} role="alert">
          {loadError}
        </p>
      )}
      {!loading && !loadError && !sample && (
        <p className={simHintClass}>No stored line for this sample.</p>
      )}
      {sample && (
        <LineInspector
          sample={sample}
          handNumber={selectedBar.sampleIndex + 1}
          mode={simType}
          showSendToSolver={showSendToSolver}
          onSendToHandSolver={onSendToHandSolver}
          resetKeyPrefix={
            resetKeyPrefix ??
            `line-${selectedBar.runId}-${selectedBar.sampleIndex}`
          }
          highlightCardId={highlightCardId}
        />
      )}
    </div>
  );
}
