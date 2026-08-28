"use client";

import { useEffect, useMemo, useState } from "react";
import { type SimType } from "@/lib/engine";
import {
  deleteRun,
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
import {
  PooledDamagePanel,
  type PooledSampleBar,
} from "./pooled-damage";
import { SIM_TYPE_LABELS } from "../types";
import { PanelTopline, SectionHeading } from "../ui";
import type { DamageRange } from "../lib/damage-range";
import { historyQueryPatch, parseSimParam } from "../routes";
import { useWorkbenchQuery } from "../use-workbench-query";

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

function formatRunTime(elapsedMs: number | null): string {
  if (elapsedMs == null) {
    return "—";
  }
  if (elapsedMs < 1000) {
    return `${Math.round(elapsedMs)}ms`;
  }
  if (elapsedMs < 60_000) {
    return `${(elapsedMs / 1000).toFixed(1)}s`;
  }
  if (elapsedMs < 3_600_000) {
    const minutes = Math.floor(elapsedMs / 60_000);
    const seconds = Math.round((elapsedMs % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(elapsedMs / 3_600_000);
  const minutes = Math.round((elapsedMs % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function resultLabel(run: RunHistoryRow): string {
  if (run.kind === "optimize") {
    return run.bestScore != null ? run.bestScore.toFixed(2) : "—";
  }
  return run.meanDamage != null ? run.meanDamage.toFixed(1) : "—";
}

function handsLabel(run: RunHistoryRow): string {
  if (run.samples == null) {
    return "—";
  }
  if (run.simType === "monte_carlo" && run.rollouts != null) {
    return `${run.samples} (${run.rollouts})`;
  }
  return String(run.samples);
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
  routeDeckId,
  refreshToken,
  onSwitchDeck,
}: {
  decks: SavedDeck[];
  routeDeckId?: string;
  refreshToken: number;
  onSwitchDeck: (deckId: string) => void;
}) {
  const { searchParams, replaceQuery } = useWorkbenchQuery("history");
  const [filterDeckId, setFilterDeckId] = useState<string | null>(
    routeDeckId ?? null,
  );

  useEffect(() => {
    if (!routeDeckId) {
      return;
    }
    setFilterDeckId(routeDeckId);
  }, [routeDeckId]);
  const [runs, setRuns] = useState<RunHistoryRow[]>([]);
  const [groups, setGroups] = useState<VersionGroup[]>([]);
  const [simType, setSimType] = useState<SimType>(
    () => parseSimParam(searchParams.get("sim")) ?? "fire_brick",
  );
  const [selectedGroupKey, setSelectedGroupKey] = useState(
    () => searchParams.get("vg") ?? "",
  );
  const [pooled, setPooled] = useState<PooledDamageResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<CardLeaderboardResponse | null>(
    null,
  );
  const [sampleHighlights, setSampleHighlights] =
    useState<PooledSampleHighlightsResponse | null>(null);
  const [selectedLeaderboardCard, setSelectedLeaderboardCard] = useState<
    string | null
  >(() => searchParams.get("card"));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localEpoch, setLocalEpoch] = useState(0);
  const dataEpoch = refreshToken + localEpoch;

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
  const [appliedRange, setAppliedRange] = useState<DamageRange | null>(null);
  const [filteredLeaderboard, setFilteredLeaderboard] =
    useState<CardLeaderboardResponse | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);

  const selectedDeck = filterDeckId
    ? (decks.find((deck) => deck.id === filterDeckId) ?? null)
    : null;
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
    setSimType(parseSimParam(searchParams.get("sim")) ?? "fire_brick");
    setSelectedGroupKey(searchParams.get("vg") ?? "");
    setSelectedLeaderboardCard(searchParams.get("card"));
  }, [searchParams]);

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
  }, [deckId, deckHash, dataEpoch]);

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
            const fromUrl = searchParams.get("vg");
            if (
              fromUrl &&
              nextGroups.some((group) => groupKey(group) === fromUrl)
            ) {
              return fromUrl;
            }
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
  }, [deckId, deckHash, simType, dataEpoch, searchParams]);

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
  }, [selectedGroupKey, poolHash, simType, selectedGroup, dataEpoch]);

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
  }, [compareOpen, compareDeckId, dataEpoch]);

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
  }, [compareOpen, compareDeckId, compareSimType, dataEpoch]);

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
    dataEpoch,
  ]);

  const sampleBars = useMemo(() => sampleBarsFromPooled(pooled), [pooled]);
  const pooledSampleKey = pooled
    ? `${poolHash ?? ""}:${simType}:${selectedGroupKey}:${pooled.runCount}`
    : "";

  useEffect(() => {
    setSelectedLeaderboardCard(null);
    if (searchParams.get("card")) {
      replaceQuery((current) => historyQueryPatch(current, { card: null }));
    }
  }, [pooledSampleKey, replaceQuery, searchParams]);

  useEffect(() => {
    if (!appliedRange || !poolHash || !selectedGroup?.attributionVersion) {
      setFilteredLeaderboard(null);
      setFilterLoading(false);
      return;
    }

    let cancelled = false;
    setFilterLoading(true);
    void (async () => {
      try {
        const boardResult = await fetchCardLeaderboard({
          deckHash: poolHash,
          simType,
          rulesVersion: selectedGroup.rulesVersion,
          samplerVersion: selectedGroup.samplerVersion,
          cardDigest: selectedGroup.cardDigest,
          attributionVersion: selectedGroup.attributionVersion!,
          damageGte: appliedRange.gte,
          damageLte: appliedRange.lte,
        });
        if (!cancelled) {
          setFilteredLeaderboard(boardResult);
        }
      } catch {
        if (!cancelled) {
          setFilteredLeaderboard(null);
        }
      } finally {
        if (!cancelled) {
          setFilterLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appliedRange, poolHash, simType, selectedGroup, dataEpoch]);

  const barCardHighlights = useMemo(
    () =>
      buildBarHighlights(
        sampleHighlights?.samples ?? [],
        selectedLeaderboardCard,
      ),
    [sampleHighlights, selectedLeaderboardCard],
  );
  const activeLeaderboard = appliedRange ? filteredLeaderboard : leaderboard;

  async function handleDeleteRun(run: RunHistoryRow) {
    if (deletingId) {
      return;
    }
    setDeletingId(run.id);
    setError("");
    try {
      await deleteRun(run.id);
      setLocalEpoch((current) => current + 1);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete that run.",
      );
    } finally {
      setDeletingId(null);
    }
  }

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
        engine version. Simulation types stay on separate charts. Filter the
        bars and card board by damage. Pooled mean, P10, P50, P90, and ending
        influence stay on the full set.
      </PanelTopline>

      <div className="history-controls">
        <label>
          Deck
          <select
            value={filterDeckId ?? "all"}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "all") {
                setFilterDeckId(null);
                return;
              }
              setFilterDeckId(value);
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
            onChange={(event) => {
              const value = event.target.value as SimType;
              setSimType(value);
              replaceQuery((current) => historyQueryPatch(current, { sim: value }));
            }}
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
            onChange={(event) => {
              const value = event.target.value;
              setSelectedGroupKey(value);
              replaceQuery((current) => historyQueryPatch(current, { vg: value }));
            }}
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
            {filterDeckId && selectedDeck
              ? ` for ${selectedDeck.name}`
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
                  <th>Hands</th>
                  <th>Runtime</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Result</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
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
                    <td className="history-mono">{handsLabel(run)}</td>
                    <td className="history-mono">{formatRunTime(run.elapsedMs)}</td>
                    <td>
                      <span
                        className={`history-status ${statusClass(run.status)}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="history-mono">{formatVersionShort(run)}</td>
                    <td className="history-result">{resultLabel(run)}</td>
                    <td className="history-actions">
                      <button
                        type="button"
                        className="text-action is-danger"
                        disabled={deletingId != null}
                        onClick={() => void handleDeleteRun(run)}
                      >
                        {deletingId === run.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
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
          <PooledDamagePanel
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
            distribution={baselineDist}
            compareDistribution={comparing ? compareDist : null}
            baselineLegend={baselineLegend}
            compareLegend={compareLegend}
            bars={sampleBars}
            simType={simType}
            cardHighlights={barCardHighlights}
            resetKey={pooledSampleKey}
            onAppliedRangeChange={setAppliedRange}
          >
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
          </PooledDamagePanel>

          {filterLoading && appliedRange && !filteredLeaderboard && (
            <p className="sim-hint">Updating card board…</p>
          )}
          {activeLeaderboard &&
            (activeLeaderboard.cards.length > 0 || appliedRange) && (
            <CardLeaderboardPanel
              leaderboard={activeLeaderboard}
              selectedCardId={selectedLeaderboardCard}
              onSelectedCardIdChange={(cardId) => {
                setSelectedLeaderboardCard(cardId);
                replaceQuery((current) =>
                  historyQueryPatch(current, { card: cardId }),
                );
              }}
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
