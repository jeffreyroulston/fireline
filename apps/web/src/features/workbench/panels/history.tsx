"use client";

import { useEffect, useMemo, useState } from "react";
import { type SimType } from "@/lib/engine";
import {
  fetchCardLeaderboard,
  fetchPooledDamage,
  fetchPooledSampleHighlights,
  fetchRunHistory,
  fetchVersionGroups,
  type CardLeaderboardResponse,
  type PooledDamageResponse,
  type PooledSampleHighlightsResponse,
  type RunHistoryRow,
  type VersionGroup,
} from "@/lib/api/client";
import type { SavedDeck } from "@/lib/decks";
import {
  buildBarHighlights,
  CardLeaderboardPanel,
} from "./card-leaderboard";
import { DamageBellCurve } from "./damage-bell-curve";
import {
  PooledDamageBarChart,
  PooledSampleDetail,
  usePooledSampleSelection,
  type PooledSampleBar,
} from "./pooled-damage-bars";
import { SIM_TYPE_LABELS } from "../types";
import { PanelTopline, SectionHeading, StatLine } from "../ui";

function groupKey(group: VersionGroup): string {
  return `${group.rulesVersion}:${group.samplerVersion}:${group.cardDigest}:${group.attributionVersion}`;
}

function formatVersionShort(run: RunHistoryRow): string {
  if (run.rulesVersion == null) {
    return "—";
  }
  return `r${run.rulesVersion} · s${run.samplerVersion} · a${run.attributionVersion}`;
}

function formatVersionLabel(group: VersionGroup): string {
  return `r${group.rulesVersion} · s${group.samplerVersion} · digest ${group.cardDigest.slice(0, 8)} · a${group.attributionVersion ?? "?"}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultLabel(run: RunHistoryRow): string {
  if (run.kind === "optimize") {
    return run.bestScore != null ? run.bestScore.toFixed(2) : "—";
  }
  return run.meanDamage != null ? run.meanDamage.toFixed(1) : "—";
}

function statusClass(status: string): string {
  if (status === "complete") return "is-complete";
  if (status === "failed" || status === "interrupted") return "is-failed";
  if (status === "running" || status === "queued") return "is-live";
  return "";
}

function expandBuckets(buckets: number[]): number[] {
  const damages: number[] = [];
  for (let damage = 0; damage < buckets.length; damage += 1) {
    const count = buckets[damage] ?? 0;
    for (let n = 0; n < count; n += 1) {
      damages.push(damage);
    }
  }
  return damages;
}

function sampleBarsFromPooled(
  pooled: PooledDamageResponse | null,
): PooledSampleBar[] {
  if (!pooled) {
    return [];
  }
  if (pooled.runs && pooled.runs.length > 0) {
    return pooled.runs.flatMap((run) =>
      run.damages.map((damage, sampleIndex) => ({
        key: `${run.id}-${sampleIndex}`,
        runId: run.id,
        sampleIndex,
        damage,
        label: run.startedAt
          ? `${formatWhen(run.startedAt)} · hand ${sampleIndex + 1}: ${damage} damage`
          : `Hand ${sampleIndex + 1}: ${damage} damage`,
      })),
    );
  }
  return expandBuckets(pooled.distribution?.buckets ?? []).map(
    (damage, index) => ({
      key: `pool-${index}`,
      runId: "",
      sampleIndex: index,
      damage,
      label: `Sample ${index + 1}: ${damage} damage`,
    }),
  );
}

function resolvePoolHash(
  deck: SavedDeck | null | undefined,
  sim: SimType,
  historyRuns: RunHistoryRow[],
): string | undefined {
  if (!deck) {
    return undefined;
  }
  const fromRun = historyRuns.find(
    (run) =>
      run.kind === "evaluate" &&
      run.status === "complete" &&
      run.simType === sim &&
      (run.deckId === deck.id || run.deckHash === deck.deckHash) &&
      !!run.deckHash,
  )?.deckHash;
  return fromRun ?? deck.deckHash;
}

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

function deltaTone(value: number): "is-hotter" | "is-cooler" | "" {
  if (value > 0) return "is-hotter";
  if (value < 0) return "is-cooler";
  return "";
}

function poolLegendLabel(
  deckName: string,
  sim: SimType,
  group: VersionGroup | null,
  showSim: boolean,
  showVersion: boolean,
): string {
  const parts = [deckName];
  if (showSim) {
    parts.push(SIM_TYPE_LABELS[sim] ?? sim);
  }
  if (showVersion && group) {
    parts.push(`r${group.rulesVersion} · s${group.samplerVersion}`);
  }
  return parts.join(" · ");
}

export function HistoryPanel({
  decks,
  activeDeck,
  filterToActiveDeck,
  refreshToken,
  onFilterToActiveDeckChange,
  onSwitchDeck,
}: {
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  filterToActiveDeck: boolean;
  refreshToken: number;
  onFilterToActiveDeckChange: (value: boolean) => void;
  onSwitchDeck: (deckId: string) => void;
}) {
  const [runs, setRuns] = useState<RunHistoryRow[]>([]);
  const [groups, setGroups] = useState<VersionGroup[]>([]);
  const [simType, setSimType] = useState<SimType>("fire_brick");
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [pooled, setPooled] = useState<PooledDamageResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<CardLeaderboardResponse | null>(
    null,
  );
  const [sampleHighlights, setSampleHighlights] =
    useState<PooledSampleHighlightsResponse | null>(null);
  const [selectedLeaderboardCard, setSelectedLeaderboardCard] = useState<
    string | null
  >(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareDeckId, setCompareDeckId] = useState("");
  const [compareSimType, setCompareSimType] = useState<SimType>("fire_brick");
  const [compareGroupKey, setCompareGroupKey] = useState("");
  const [compareGroups, setCompareGroups] = useState<VersionGroup[]>([]);
  const [comparePooled, setComparePooled] = useState<PooledDamageResponse | null>(
    null,
  );
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [compareRuns, setCompareRuns] = useState<RunHistoryRow[]>([]);

  const selectedDeck = filterToActiveDeck ? activeDeck : null;
  const deckId = selectedDeck?.id;
  const deckHash = selectedDeck?.deckHash;
  const poolHash = useMemo(
    () => resolvePoolHash(selectedDeck, simType, runs),
    [selectedDeck, simType, runs],
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => groupKey(group) === selectedGroupKey) ?? null,
    [groups, selectedGroupKey],
  );

  const compareDeck = useMemo(
    () => decks.find((deck) => deck.id === compareDeckId) ?? null,
    [decks, compareDeckId],
  );
  const compareGroup = useMemo(
    () =>
      compareGroups.find((group) => groupKey(group) === compareGroupKey) ?? null,
    [compareGroups, compareGroupKey],
  );
  const comparePoolHash = useMemo(
    () => resolvePoolHash(compareDeck, compareSimType, compareRuns),
    [compareDeck, compareSimType, compareRuns],
  );

  const comparing =
    compareOpen &&
    !!comparePooled?.distribution &&
    !!pooled?.distribution;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const history = await fetchRunHistory(
          deckId ? { deckId } : deckHash ? { deckHash } : undefined,
        );
        if (!cancelled) {
          setRuns(history);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load run history.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, deckHash, refreshToken]);

  useEffect(() => {
    if (!deckId && !deckHash) {
      setGroups([]);
      setSelectedGroupKey("");
      setPooled(null);
      setLeaderboard(null);
      setSampleHighlights(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const nextGroups = await fetchVersionGroups({
          ...(deckId ? { deckId } : { deckHash }),
          simType,
          kind: "evaluate",
        });
        if (!cancelled) {
          setGroups(nextGroups);
          setSelectedGroupKey((current) => {
            if (current && nextGroups.some((group) => groupKey(group) === current)) {
              return current;
            }
            return nextGroups[0] ? groupKey(nextGroups[0]) : "";
          });
          if (nextGroups.length === 0) {
            setPooled(null);
            setLeaderboard(null);
          }
        }
      } catch {
        if (!cancelled) {
          setGroups([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, deckHash, simType, refreshToken]);

  useEffect(() => {
    if (!selectedGroupKey || !poolHash || !selectedGroup?.attributionVersion) {
      setPooled(null);
      setLeaderboard(null);
      setSampleHighlights(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [poolResult, boardResult, highlightResult] = await Promise.all([
          fetchPooledDamage({
            deckHash: poolHash,
            simType,
            rulesVersion: selectedGroup.rulesVersion,
            samplerVersion: selectedGroup.samplerVersion,
            cardDigest: selectedGroup.cardDigest,
          }),
          fetchCardLeaderboard({
            deckHash: poolHash,
            simType,
            rulesVersion: selectedGroup.rulesVersion,
            samplerVersion: selectedGroup.samplerVersion,
            cardDigest: selectedGroup.cardDigest,
            attributionVersion: selectedGroup.attributionVersion!,
          }),
          fetchPooledSampleHighlights({
            deckHash: poolHash,
            simType,
            rulesVersion: selectedGroup.rulesVersion,
            samplerVersion: selectedGroup.samplerVersion,
            cardDigest: selectedGroup.cardDigest,
          }),
        ]);
        if (!cancelled) {
          setPooled(poolResult);
          setLeaderboard(boardResult);
          setSampleHighlights(highlightResult);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load pooled analysis.",
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
  }, [selectedGroupKey, poolHash, simType, selectedGroup, refreshToken]);

  useEffect(() => {
    if (!compareOpen || !compareDeckId) {
      setCompareRuns([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const history = await fetchRunHistory({ deckId: compareDeckId });
        if (!cancelled) {
          setCompareRuns(history);
        }
      } catch {
        if (!cancelled) {
          setCompareRuns([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compareOpen, compareDeckId, refreshToken]);

  useEffect(() => {
    if (!compareOpen || !compareDeckId) {
      setCompareGroups([]);
      setCompareGroupKey("");
      setComparePooled(null);
      setCompareError("");
      return;
    }

    // Drop the previous pool immediately so a stale group key cannot
    // fetch against the newly selected deck's hash.
    setCompareGroups([]);
    setCompareGroupKey("");
    setComparePooled(null);
    setCompareError("");

    let cancelled = false;
    void (async () => {
      try {
        const nextGroups = await fetchVersionGroups({
          deckId: compareDeckId,
          simType: compareSimType,
          kind: "evaluate",
        });
        if (!cancelled) {
          setCompareGroups(nextGroups);
          setCompareGroupKey(nextGroups[0] ? groupKey(nextGroups[0]) : "");
        }
      } catch {
        if (!cancelled) {
          setCompareGroups([]);
          setCompareGroupKey("");
          setComparePooled(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compareOpen, compareDeckId, compareSimType, refreshToken]);

  useEffect(() => {
    if (
      !compareOpen ||
      !compareGroupKey ||
      !comparePoolHash ||
      !compareGroup
    ) {
      setComparePooled(null);
      setCompareLoading(false);
      if (!compareGroupKey) {
        setCompareError("");
      }
      return;
    }

    let cancelled = false;
    setCompareLoading(true);
    setCompareError("");
    void (async () => {
      try {
        const result = await fetchPooledDamage({
          deckHash: comparePoolHash,
          simType: compareSimType,
          rulesVersion: compareGroup.rulesVersion,
          samplerVersion: compareGroup.samplerVersion,
          cardDigest: compareGroup.cardDigest,
        });
        if (!cancelled) {
          setComparePooled(result);
          if (!result.distribution) {
            setCompareError("No pooled damage for that version group.");
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setComparePooled(null);
          setCompareError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load compare pool.",
          );
        }
      } finally {
        if (!cancelled) {
          setCompareLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    compareOpen,
    compareGroupKey,
    comparePoolHash,
    compareSimType,
    compareGroup,
    refreshToken,
  ]);

  const sampleBars = useMemo(() => sampleBarsFromPooled(pooled), [pooled]);
  const sampleMax = Math.max(pooled?.distribution?.max ?? 0, 1);
  const pooledSampleKey = pooled
    ? `${poolHash ?? ""}:${simType}:${selectedGroupKey}:${pooled.runCount}`
    : "";
  const [selectedBarKey, setSelectedBarKey] = useState<string | null>(null);
  const selectedSampleBar = useMemo(
    () =>
      selectedBarKey != null
        ? (sampleBars.find((bar) => bar.key === selectedBarKey) ?? null)
        : null,
    [sampleBars, selectedBarKey],
  );
  const pooledSample = usePooledSampleSelection(
    selectedSampleBar?.runId ?? null,
    selectedSampleBar?.sampleIndex ?? null,
  );

  useEffect(() => {
    setSelectedBarKey(null);
    setSelectedLeaderboardCard(null);
  }, [pooledSampleKey]);

  const barCardHighlights = useMemo(
    () =>
      buildBarHighlights(
        sampleHighlights?.samples ?? [],
        selectedLeaderboardCard,
      ),
    [sampleHighlights, selectedLeaderboardCard],
  );

  function openCompare() {
    setCompareOpen(true);
    setCompareDeckId(selectedDeck?.id ?? decks[0]?.id ?? "");
    setCompareSimType(simType);
    setCompareGroupKey("");
    setComparePooled(null);
    setCompareError("");
  }

  function clearCompare() {
    setCompareOpen(false);
    setCompareDeckId("");
    setCompareGroupKey("");
    setCompareGroups([]);
    setComparePooled(null);
    setCompareError("");
    setCompareRuns([]);
    setCompareLoading(false);
  }

  const baselineDist = pooled?.distribution ?? null;
  const compareDist = comparePooled?.distribution ?? null;

  const sameDeckName =
    !!selectedDeck &&
    !!compareDeck &&
    selectedDeck.name === compareDeck.name;
  const sameSim = simType === compareSimType;
  const showSimInLegend = comparing && !sameSim;
  const showVersionInLegend =
    comparing &&
    (sameDeckName || sameSim) &&
    !!selectedGroup &&
    !!compareGroup;

  const baselineLegend = selectedDeck
    ? poolLegendLabel(
        selectedDeck.name,
        simType,
        selectedGroup,
        showSimInLegend || (comparing && sameDeckName && sameSim),
        showVersionInLegend,
      )
    : "Baseline";
  const compareLegend = compareDeck
    ? poolLegendLabel(
        compareDeck.name,
        compareSimType,
        compareGroup,
        showSimInLegend || (comparing && sameDeckName && sameSim),
        showVersionInLegend,
      )
    : "Compare";

  return (
    <div className="history-mode">
      <PanelTopline kicker="CROSS-RUN ANALYSIS">
        Review completed sims, then pool damage and card rates only within one
        engine version. Simulation types stay on separate charts.
      </PanelTopline>

      <div className="history-controls">
        <label>
          Deck
          <select
            value={filterToActiveDeck ? (activeDeck?.id ?? "") : "all"}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all") {
                onFilterToActiveDeckChange(false);
                return;
              }
              onFilterToActiveDeckChange(true);
              onSwitchDeck(value);
            }}
          >
            <option value="all">All decks</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sim type
          <select
            value={simType}
            onChange={(event) => setSimType(event.target.value as SimType)}
          >
            {(Object.keys(SIM_TYPE_LABELS) as SimType[]).map((id) => (
              <option key={id} value={id}>
                {SIM_TYPE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version group
          <select
            value={selectedDeck ? selectedGroupKey : ""}
            disabled={!selectedDeck || groups.length === 0}
            onChange={(event) => setSelectedGroupKey(event.target.value)}
          >
            {!selectedDeck && (
              <option value="">Pick a deck to pool</option>
            )}
            {selectedDeck && groups.length === 0 && (
              <option value="">No completed evaluate runs</option>
            )}
            {selectedDeck &&
              groups.map((group) => (
                <option key={groupKey(group)} value={groupKey(group)}>
                  {formatVersionLabel(group)} · {group.runCount} runs
                </option>
              ))}
          </select>
        </label>
      </div>

      {!selectedDeck && (
        <p className="sim-hint">
          Run history can show every deck. Pooled damage and card rates need a
          single deck so lists are not mixed.
        </p>
      )}

      <section className="history-panel">
        <SectionHeading
          title="RUN HISTORY"
          meta={<strong>{runs.length} runs</strong>}
        />
        {runs.length === 0 ? (
          <p className="history-empty">
            No completed runs yet
            {filterToActiveDeck && activeDeck
              ? ` for ${activeDeck.name}`
              : ""}
            . Finish an evaluate or optimize to fill this table.
          </p>
        ) : (
          <div className="history-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Deck</th>
                  <th>Kind</th>
                  <th>Sim</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{formatWhen(run.startedAt)}</td>
                    <td>
                      {(run.deckId &&
                        decks.find((deck) => deck.id === run.deckId)?.name) ||
                        run.deckName ||
                        "—"}
                    </td>
                    <td className="history-kind">{run.kind}</td>
                    <td>
                      {run.simType
                        ? (SIM_TYPE_LABELS[run.simType as SimType] ?? run.simType)
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`history-status ${statusClass(run.status)}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="history-mono">{formatVersionShort(run)}</td>
                    <td className="history-result">{resultLabel(run)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {loading && <p className="sim-hint">Loading pooled analysis…</p>}

      {pooled?.distribution && baselineDist && (
        <div className="history-analysis">
          <section className="history-panel history-pooled">
            <SectionHeading
              className="history-pooled-heading"
              title="POOLED DAMAGE"
              meta={
                <div className="history-pooled-heading-meta">
                  <strong>
                    {comparing && compareDist
                      ? `${pooled.runCount} vs ${comparePooled?.runCount ?? 0} runs · ${baselineDist.totalSamples} vs ${compareDist.totalSamples} samples`
                      : `${pooled.runCount} runs · ${baselineDist.totalSamples} samples`}
                  </strong>
                  {compareOpen ? (
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={clearCompare}
                    >
                      Clear compare
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={openCompare}
                    >
                      Compare
                    </button>
                  )}
                </div>
              }
            />

            {compareOpen && (
              <div className="history-compare-panel">
                <p className="history-compare-kicker">COMPARE AGAINST</p>
                <div className="history-controls history-compare-controls">
                  <label>
                    Deck
                    <select
                      value={compareDeckId}
                      onChange={(event) => setCompareDeckId(event.target.value)}
                    >
                      <option value="">Choose a deck</option>
                      {decks.map((deck) => (
                        <option key={deck.id} value={deck.id}>
                          {deck.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sim type
                    <select
                      value={compareSimType}
                      disabled={!compareDeckId}
                      onChange={(event) =>
                        setCompareSimType(event.target.value as SimType)
                      }
                    >
                      {(Object.keys(SIM_TYPE_LABELS) as SimType[]).map((id) => (
                        <option key={id} value={id}>
                          {SIM_TYPE_LABELS[id]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Version group
                    <select
                      value={compareDeckId ? compareGroupKey : ""}
                      disabled={!compareDeckId || compareGroups.length === 0}
                      onChange={(event) =>
                        setCompareGroupKey(event.target.value)
                      }
                    >
                      {!compareDeckId && (
                        <option value="">Choose a deck</option>
                      )}
                      {compareDeckId && compareGroups.length === 0 && (
                        <option value="">No completed evaluate runs</option>
                      )}
                      {compareDeckId &&
                        compareGroups.map((group) => (
                          <option key={groupKey(group)} value={groupKey(group)}>
                            {formatVersionLabel(group)} · {group.runCount} runs
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {compareLoading && (
                  <p className="sim-hint">Loading compare pool…</p>
                )}
                {compareError && (
                  <p className="error-banner" role="alert">
                    {compareError}
                  </p>
                )}
              </div>
            )}

            {comparing && compareDist ? (
              <>
                <div className="history-compare-legend" aria-hidden="true">
                  <span className="is-baseline">{baselineLegend}</span>
                  <span className="is-compare">{compareLegend}</span>
                </div>
                <div className="stat-line history-compare-stats">
                  <span>
                    <small>MEAN</small>
                    <b className="history-compare-pair">
                      <em className="is-baseline">
                        {baselineDist.mean.toFixed(1)}
                      </em>
                      <em className="is-compare">
                        {compareDist.mean.toFixed(1)}
                      </em>
                    </b>
                    <i
                      className={`history-delta ${deltaTone(compareDist.mean - baselineDist.mean)}`}
                    >
                      {formatSigned(compareDist.mean - baselineDist.mean, 1)}
                    </i>
                  </span>
                  <span>
                    <small>P50</small>
                    <b className="history-compare-pair">
                      <em className="is-baseline">{baselineDist.p50}</em>
                      <em className="is-compare">{compareDist.p50}</em>
                    </b>
                    <i
                      className={`history-delta ${deltaTone(compareDist.p50 - baselineDist.p50)}`}
                    >
                      {formatSigned(compareDist.p50 - baselineDist.p50, 0)}
                    </i>
                  </span>
                  <span>
                    <small>P90</small>
                    <b className="history-compare-pair">
                      <em className="is-baseline">{baselineDist.p90}</em>
                      <em className="is-compare">{compareDist.p90}</em>
                    </b>
                    <i
                      className={`history-delta ${deltaTone(compareDist.p90 - baselineDist.p90)}`}
                    >
                      {formatSigned(compareDist.p90 - baselineDist.p90, 0)}
                    </i>
                  </span>
                  <span>
                    <small>RANGE</small>
                    <b className="history-compare-pair">
                      <em className="is-baseline">
                        {baselineDist.min}–{baselineDist.max}
                      </em>
                      <em className="is-compare">
                        {compareDist.min}–{compareDist.max}
                      </em>
                    </b>
                    <i className="history-delta history-delta-range">
                      <span
                        className={deltaTone(compareDist.min - baselineDist.min)}
                      >
                        min {formatSigned(compareDist.min - baselineDist.min, 0)}
                      </span>
                      <span
                        className={deltaTone(compareDist.max - baselineDist.max)}
                      >
                        max {formatSigned(compareDist.max - baselineDist.max, 0)}
                      </span>
                    </i>
                  </span>
                </div>
              </>
            ) : (
              <StatLine
                items={[
                  { label: "MEAN", value: baselineDist.mean.toFixed(1) },
                  { label: "P50", value: baselineDist.p50 },
                  { label: "P90", value: baselineDist.p90 },
                  {
                    label: "RANGE",
                    value: (
                      <>
                        {baselineDist.min}–{baselineDist.max}
                      </>
                    ),
                  },
                ]}
              />
            )}

            <div
              className={`history-pooled-charts${comparing ? " is-compare" : ""}`}
            >
              <div className="history-bell-plot">
                {comparing && compareDist ? (
                  <DamageBellCurve
                    series={[
                      {
                        id: "baseline",
                        buckets: baselineDist.buckets,
                        mean: baselineDist.mean,
                        p50: baselineDist.p50,
                        p90: baselineDist.p90,
                        min: baselineDist.min,
                        max: baselineDist.max,
                      },
                      {
                        id: "compare",
                        buckets: compareDist.buckets,
                        mean: compareDist.mean,
                        p50: compareDist.p50,
                        p90: compareDist.p90,
                        min: compareDist.min,
                        max: compareDist.max,
                      },
                    ]}
                  />
                ) : (
                  <DamageBellCurve
                    buckets={baselineDist.buckets}
                    mean={baselineDist.mean}
                    p50={baselineDist.p50}
                    p90={baselineDist.p90}
                    min={baselineDist.min}
                    max={baselineDist.max}
                  />
                )}
              </div>
              {!comparing && (
                <PooledDamageBarChart
                  bars={sampleBars}
                  sampleMax={sampleMax}
                  selectedKey={selectedBarKey}
                  onSelectedKeyChange={setSelectedBarKey}
                  cardHighlights={barCardHighlights}
                />
              )}
            </div>
            {!comparing && (
              <PooledSampleDetail
                selectedBar={selectedSampleBar}
                simType={simType}
                sample={pooledSample.sample}
                loading={pooledSample.loading}
                loadError={pooledSample.loadError}
                mcIndex={pooledSample.mcIndex}
                onMcIndexChange={pooledSample.setMcIndex}
              />
            )}
          </section>

          {leaderboard && leaderboard.cards.length > 0 && (
            <CardLeaderboardPanel
              leaderboard={leaderboard}
              selectedCardId={selectedLeaderboardCard}
              onSelectedCardIdChange={setSelectedLeaderboardCard}
            />
          )}
        </div>
      )}

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
