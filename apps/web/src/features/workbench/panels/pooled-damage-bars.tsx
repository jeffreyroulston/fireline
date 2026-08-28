"use client";

import { useEffect, useRef, useState } from "react";
import type { CardId, SimType } from "@/lib/engine";
import { fetchPooledSample } from "@/lib/api/client";
import type { SampleHand } from "../types";
import type { BarCardHighlight } from "./card-leaderboard";
import { LineInspector } from "./sample-detail";
import { DamageBars } from "../ui";

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
  const [mcIndex, setMcIndex] = useState<number | null>(null);

  useEffect(() => {
    setMcIndex(null);
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

  return { sample, loading, loadError, mcIndex, setMcIndex };
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
    <div className="history-bars-panel">
      <div className="history-bars-scroll" aria-label="Pooled sample damage">
        <DamageBars
          className="short history-bars"
          scaleMax={sampleMax}
          selectedKey={selectedKey}
          onSelect={onSelectedKeyChange}
          items={bars.map((bar) => {
            const cardHighlight = cardHighlights[bar.key];
            const dimmed = dimmedKeys?.has(bar.key) ?? false;
            return {
              key: bar.key,
              damage: bar.damage,
              title: bar.label,
              disabled: !(bar.inspectable ?? Boolean(bar.runId)),
              className: [
                dimmed ? "is-out-of-range" : "",
                cardHighlight === "in_hand" ? "is-card-in-hand" : "",
                cardHighlight === "played" ? "is-card-played" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined,
            };
          })}
        />
      </div>
      <p className="sim-hint history-bars-hint">
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
  mcIndex,
  onMcIndexChange,
  showSendToSolver = false,
  onSendToHandSolver,
  resetKeyPrefix,
}: {
  selectedBar: PooledSampleBar | null;
  simType: SimType;
  sample: SampleHand | null;
  loading: boolean;
  loadError: string;
  mcIndex: number | null;
  onMcIndexChange: (index: number | null) => void;
  showSendToSolver?: boolean;
  onSendToHandSolver?: (sample: SampleHand) => void;
  resetKeyPrefix?: string;
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
    <div className="history-pooled-sample" ref={detailRef}>
      {loading && <p className="sim-hint">Loading sample…</p>}
      {loadError && (
        <p className="error-banner" role="alert">
          {loadError}
        </p>
      )}
      {!loading && !loadError && !sample && (
        <p className="sim-hint">No stored line for this sample.</p>
      )}
      {sample && (
        <LineInspector
          sample={sample}
          handNumber={selectedBar.sampleIndex + 1}
          mode={simType}
          mcIndex={mcIndex}
          onMcIndexChange={onMcIndexChange}
          showSendToSolver={showSendToSolver}
          onSendToHandSolver={onSendToHandSolver}
          resetKeyPrefix={
            resetKeyPrefix ??
            `line-${selectedBar.runId}-${selectedBar.sampleIndex}`
          }
        />
      )}
    </div>
  );
}
