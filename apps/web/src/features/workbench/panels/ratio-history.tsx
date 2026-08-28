"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CARDS,
  listToCounts,
  parseDecklist,
  PLAYABLE_CARD_IDS,
  type CardId,
  type DeckCounts,
} from "@/lib/engine";
import {
  fetchRankedCandidates,
  fetchVersionGroups,
  type RankedCandidatesResponse,
  type RunHistoryRow,
  type VersionGroup,
} from "@/lib/api/client";
import type { SavedDeck } from "@/lib/decks";
import { SectionHeading } from "../ui";
import { historyQueryPatch } from "../routes";
import { useWorkbenchQuery } from "../use-workbench-query";

function groupKey(group: VersionGroup): string {
  return `${group.rulesVersion}:${group.samplerVersion}:${group.attributionVersion}`;
}

function formatVersionLabel(group: VersionGroup): string {
  return `r${group.rulesVersion} · s${group.samplerVersion} · a${group.attributionVersion ?? "?"}`;
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
  const minutes = Math.floor(elapsedMs / 60_000);
  const seconds = Math.round((elapsedMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatSignedCopies(delta: number): string {
  if (delta > 0) return `+${delta}×`;
  if (delta < 0) return `−${Math.abs(delta)}×`;
  return "0×";
}

function deckDiffEntries(
  baseCounts: DeckCounts,
  nextCounts: DeckCounts,
): { id: CardId; from: number; to: number; delta: number }[] {
  const entries: { id: CardId; from: number; to: number; delta: number }[] =
    [];
  for (const id of PLAYABLE_CARD_IDS) {
    const from = baseCounts[id] ?? 0;
    const to = nextCounts[id] ?? 0;
    if (from === to) continue;
    entries.push({ id, from, to, delta: to - from });
  }
  return entries.sort((a, b) => {
    if (a.delta !== b.delta) return a.delta - b.delta;
    return CARDS[a.id].name.localeCompare(CARDS[b.id].name);
  });
}

function runMatchesGroup(run: RunHistoryRow, group: VersionGroup): boolean {
  return (
    run.kind === "optimize" &&
    run.status === "complete" &&
    run.rulesVersion === group.rulesVersion &&
    run.samplerVersion === group.samplerVersion &&
    run.attributionVersion === group.attributionVersion
  );
}

function countsFromRecord(counts: Record<string, number>): DeckCounts {
  return counts as DeckCounts;
}

export function RatioHistoryPanel({
  deck,
  runs,
  refreshToken,
  onSaveDecklist,
  onOpenRun,
}: {
  deck: SavedDeck;
  runs: RunHistoryRow[];
  refreshToken: number;
  onSaveDecklist?: (
    counts: DeckCounts,
    score: number,
    rank: number,
    deckName: string,
  ) => void | Promise<void>;
  onOpenRun: (runId: string, deckId: string) => void;
}) {
  const { searchParams, replaceQuery } = useWorkbenchQuery("history");
  const optimizeGroupFromUrl = searchParams.get("ovg");
  const [groups, setGroups] = useState<VersionGroup[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState(
    () => optimizeGroupFromUrl ?? "",
  );
  const [candidates, setCandidates] =
    useState<RankedCandidatesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const baseCounts = useMemo(
    () => listToCounts(parseDecklist(deck.text)),
    [deck.text],
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => groupKey(group) === selectedGroupKey) ?? null,
    [groups, selectedGroupKey],
  );

  const groupRuns = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }
    return runs
      .filter((run) => runMatchesGroup(run, selectedGroup))
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );
  }, [runs, selectedGroup]);

  useEffect(() => {
    if (optimizeGroupFromUrl) {
      setSelectedGroupKey(optimizeGroupFromUrl);
    }
  }, [optimizeGroupFromUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextGroups = await fetchVersionGroups({
          deckId: deck.id,
          kind: "optimize",
        });
        if (!cancelled) {
          setGroups(nextGroups);
          setSelectedGroupKey((current) => {
            if (
              optimizeGroupFromUrl &&
              nextGroups.some((group) => groupKey(group) === optimizeGroupFromUrl)
            ) {
              return optimizeGroupFromUrl;
            }
            if (current && nextGroups.some((group) => groupKey(group) === current)) {
              return current;
            }
            return nextGroups[0] ? groupKey(nextGroups[0]) : "";
          });
          if (nextGroups.length === 0) {
            setCandidates(null);
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
  }, [deck.id, refreshToken, optimizeGroupFromUrl]);

  useEffect(() => {
    if (!selectedGroup) {
      setCandidates(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchRankedCandidates({
          deckId: deck.id,
          rulesVersion: selectedGroup.rulesVersion,
          samplerVersion: selectedGroup.samplerVersion,
        });
        if (!cancelled) {
          setCandidates(result);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setCandidates(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load ratio lab history.",
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
  }, [deck.id, selectedGroup, refreshToken]);

  return (
    <div className="history-ratio-analysis">
      <section className="history-panel history-ratio-panel">
        <SectionHeading
          title="RATIO LAB HISTORY"
          meta={
            <strong>
              {selectedGroup
                ? `${groupRuns.length} run${groupRuns.length === 1 ? "" : "s"}`
                : groups.length > 0
                  ? `${groups.length} version group${groups.length === 1 ? "" : "s"}`
                  : "0 runs"}
            </strong>
          }
        />

        {groups.length === 0 ? (
          <p className="history-empty">
            No completed ratio lab runs for {deck.name} yet.
          </p>
        ) : (
          <>
            <div className="history-controls history-ratio-controls">
              <label>
                Version group
                <select
                  value={selectedGroupKey}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedGroupKey(value);
                    replaceQuery((current) =>
                      historyQueryPatch(current, { ovg: value }),
                    );
                  }}
                >
                  {groups.map((group) => (
                    <option key={groupKey(group)} value={groupKey(group)}>
                      {formatVersionLabel(group)} · {group.runCount} runs
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {loading && <p className="sim-hint">Loading ratio lab history…</p>}

            {!loading && candidates && candidates.candidates.length > 0 && (
              <div className="history-ratio-candidates">
                <p className="history-ratio-kicker">
                  TOP LISTS ACROSS {groupRuns.length} RUN
                  {groupRuns.length === 1 ? "" : "S"}
                </p>
                <ol className="ratio-rankings">
                  {candidates.candidates.map((entry) => {
                    const entryCounts = countsFromRecord(entry.counts);
                    const changes = deckDiffEntries(baseCounts, entryCounts);
                    return (
                      <li key={`${entry.deckHash}-${entry.rank}`}>
                        <header>
                          <span>#{entry.rank}</span>
                          <strong>{entry.bestScore.toFixed(2)}</strong>
                          <small>
                            avg {entry.avgScore.toFixed(2)} · {entry.appearances}{" "}
                            appearance{entry.appearances === 1 ? "" : "s"}
                            {entry.wins > 0
                              ? ` · ${entry.wins} win${entry.wins === 1 ? "" : "s"}`
                              : ""}
                          </small>
                        </header>
                        {changes.length > 0 && (
                          <div className="ratio-changes">
                            <p className="ratio-changes-label">
                              {changes.length} change
                              {changes.length === 1 ? "" : "s"} vs base
                            </p>
                            <ul>
                              {changes.map((change) => (
                                <li
                                  key={`${entry.rank}-Δ-${change.id}`}
                                  className={
                                    change.delta > 0 ? "is-added" : "is-cut"
                                  }
                                >
                                  <b>{formatSignedCopies(change.delta)}</b>
                                  <span>
                                    {CARDS[change.id]?.name ?? change.id}
                                    <small>
                                      {change.from}× → {change.to}×
                                    </small>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <ul className="ratio-full-list">
                          {Object.entries(entry.counts)
                            .filter(([, count]) => count > 0)
                            .sort((a, b) => b[1] - a[1])
                            .map(([id, count]) => (
                              <li key={`${entry.rank}-${id}`}>
                                <b>{count}×</b>
                                <span>{CARDS[id as CardId]?.name ?? id}</span>
                              </li>
                            ))}
                        </ul>
                        {onSaveDecklist && (
                          <button
                            type="button"
                            className="ratio-save-deck"
                            onClick={() =>
                              void onSaveDecklist(
                                entryCounts,
                                entry.bestScore,
                                entry.rank,
                                deck.name,
                              )
                            }
                          >
                            Save decklist
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {!loading &&
              candidates &&
              candidates.candidates.length === 0 &&
              groupRuns.length > 0 && (
                <p className="history-empty">
                  No ranked lists stored for this version group yet.
                </p>
              )}

            {groupRuns.length > 0 && (
              <div className="history-ratio-runs">
                <p className="history-ratio-kicker">RUNS IN THIS GROUP</p>
                <div className="history-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Hands</th>
                        <th>Runtime</th>
                        <th>Best score</th>
                        <th>
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRuns.map((run) => (
                        <tr key={run.id}>
                          <td>{formatWhen(run.startedAt)}</td>
                          <td className="history-mono">
                            {run.samples != null ? String(run.samples) : "—"}
                          </td>
                          <td className="history-mono">
                            {formatRunTime(run.elapsedMs)}
                          </td>
                          <td className="history-result">
                            {run.bestScore != null
                              ? run.bestScore.toFixed(2)
                              : "—"}
                          </td>
                          <td className="history-actions">
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => onOpenRun(run.id, deck.id)}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
