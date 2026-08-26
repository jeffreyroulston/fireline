"use client";

import { useEffect, useRef, useState } from "react";
import type { CardId, LineStep, SimType } from "@/lib/engine";
import { fetchPooledSample } from "@/lib/api/client";
import type { SampleHand } from "../types";
import type { BarCardHighlight } from "./card-leaderboard";
import { SampleDetailPanel } from "./sample-detail";
import { DamageBars } from "../ui";

export interface PooledSampleBar {
  key: string;
  runId: string;
  sampleIndex: number;
  damage: number;
  label: string;
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
          steps: result.steps as LineStep[],
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
  sampleMax,
  selectedKey,
  onSelectedKeyChange,
  cardHighlights = {},
}: {
  bars: PooledSampleBar[];
  sampleMax: number;
  selectedKey: string | null;
  onSelectedKeyChange: (key: string | null) => void;
  cardHighlights?: Record<string, BarCardHighlight>;
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
            return {
              key: bar.key,
              damage: bar.damage,
              title: bar.label,
              disabled: !bar.runId,
              className: [
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
}: {
  selectedBar: PooledSampleBar | null;
  simType: SimType;
  sample: SampleHand | null;
  loading: boolean;
  loadError: string;
  mcIndex: number | null;
  onMcIndexChange: (index: number | null) => void;
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

  const sampleMode =
    sample && sample.steps.length > 0 ? ("fire_brick" as SimType) : simType;

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
        <SampleDetailPanel
          sample={sample}
          handNumber={selectedBar.sampleIndex + 1}
          mode={sampleMode}
          mcIndex={mcIndex}
          onMcIndexChange={onMcIndexChange}
          showSendToSolver={false}
          resetKeyPrefix={`history-${selectedBar.runId}-${selectedBar.sampleIndex}`}
        />
      )}
    </div>
  );
}

export function PooledDamageBars({
  bars,
  sampleMax,
  simType,
}: {
  bars: PooledSampleBar[];
  sampleMax: number;
  simType: SimType;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedBar =
    selectedKey != null
      ? (bars.find((bar) => bar.key === selectedKey) ?? null)
      : null;
  const { sample, loading, loadError, mcIndex, setMcIndex } =
    usePooledSampleSelection(
      selectedBar?.runId ?? null,
      selectedBar?.sampleIndex ?? null,
    );

  useEffect(() => {
    setSelectedKey(null);
  }, [bars.length, bars[0]?.key, bars.at(-1)?.key]);

  return (
    <>
      <PooledDamageBarChart
        bars={bars}
        sampleMax={sampleMax}
        selectedKey={selectedKey}
        onSelectedKeyChange={setSelectedKey}
      />
      <PooledSampleDetail
        selectedBar={selectedBar}
        simType={simType}
        sample={sample}
        loading={loading}
        loadError={loadError}
        mcIndex={mcIndex}
        onMcIndexChange={setMcIndex}
      />
    </>
  );
}
