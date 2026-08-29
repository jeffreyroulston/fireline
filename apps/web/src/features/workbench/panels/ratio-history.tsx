"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CARDS,
  listToCounts,
  parseDecklist,
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
import { cn, buttonVariants } from "@/lib/utils";
import { typeSubsectionLabel } from "@/lib/utils/typography";
import { StatusBadge } from "@/components/status-badge";
import { SectionHeading } from "../ui";
import { historyQueryPatch } from "../routes";
import { useWorkbenchQuery } from "../hooks/use-workbench-query";
import {
  formatRunTime,
  formatVersionLabel,
  formatWhen,
  groupKey,
  historyMonoCellClass,
  historyPanelTableWrapClass,
  historyResultCellClass,
} from "./history/shared";
import {
  deckDiffEntries,
  formatSignedCopies,
  ratioChangeRowClass,
  ratioChangesClass,
  ratioRankingHeaderClass,
  ratioRankingItemClass,
  ratioSaveDeckClass,
} from "./ratios/shared";

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
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[22px]">
      <section className="min-w-0 border border-border bg-surface px-[18px] pt-[18px] pb-3 [&>.section-heading]:mb-3">
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
          <p className="mb-2 py-2 pb-3 text-sm leading-normal text-muted">
            No completed ratio lab runs for {deck.name} yet.
          </p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-[minmax(14ch,1.3fr)_minmax(12ch,0.9fr)_minmax(16ch,1.2fr)] items-end gap-x-[18px] gap-y-3.5 max-[900px]:grid-cols-1">
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

            {loading && (
              <p className="mt-2 text-xs leading-snug text-muted">
                Loading ratio lab history…
              </p>
            )}

            {!loading && candidates && candidates.candidates.length > 0 && (
              <div className="mb-[22px] bg-foreground p-7 text-white">
                <p className="mb-2.5 font-mono text-[10px] tracking-[0.08em] text-white/55 uppercase">
                  TOP LISTS ACROSS {groupRuns.length} RUN
                  {groupRuns.length === 1 ? "" : "S"}
                </p>
                <ol className="grid list-none grid-cols-1 gap-4 p-0">
                  {candidates.candidates.map((entry) => {
                    const entryCounts = countsFromRecord(entry.counts);
                    const changes = deckDiffEntries(baseCounts, entryCounts);
                    return (
                      <li
                        key={`${entry.deckHash}-${entry.rank}`}
                        className={ratioRankingItemClass}
                      >
                        <header className={cn(ratioRankingHeaderClass, "flex-wrap")}>
                          <span className="font-mono text-[11px] tracking-[0.08em] text-white/55">
                            #{entry.rank}
                          </span>
                          <strong className="font-display text-[32px] leading-none text-primary">
                            {entry.bestScore.toFixed(2)}
                          </strong>
                          <small className="font-mono text-[10px] tracking-[0.06em] text-white/55">
                            avg {entry.avgScore.toFixed(2)} · {entry.appearances}{" "}
                            appearance{entry.appearances === 1 ? "" : "s"}
                            {entry.wins > 0
                              ? ` · ${entry.wins} win${entry.wins === 1 ? "" : "s"}`
                              : ""}
                          </small>
                        </header>
                        {changes.length > 0 && (
                          <div className={ratioChangesClass}>
                            <p className="m-0 font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
                              {changes.length} change
                              {changes.length === 1 ? "" : "s"} vs base
                            </p>
                            <ul className="grid list-none gap-1.5 p-0">
                              {changes.map((change) => (
                                <li
                                  key={`${entry.rank}-Δ-${change.id}`}
                                  className={cn(
                                    ratioChangeRowClass,
                                    change.delta > 0
                                      ? "[&_b]:text-[#9ed4a8]"
                                      : "[&_b]:text-[#f0a090]",
                                  )}
                                >
                                  <b className="font-mono">
                                    {formatSignedCopies(change.delta)}
                                  </b>
                                  <span className="grid min-w-0 gap-0.5">
                                    {CARDS[change.id]?.name ?? change.id}
                                    <small className="font-mono text-[10px] text-white/45">
                                      {change.from}× → {change.to}×
                                    </small>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <ul className="grid list-none gap-1.5 p-0">
                          {Object.entries(entry.counts)
                            .filter(([, count]) => count > 0)
                            .sort((a, b) => b[1] - a[1])
                            .map(([id, count]) => (
                              <li
                                key={`${entry.rank}-${id}`}
                                className={ratioChangeRowClass}
                              >
                                <b className="font-mono text-primary">{count}×</b>
                                <span>{CARDS[id as CardId]?.name ?? id}</span>
                              </li>
                            ))}
                        </ul>
                        {onSaveDecklist && (
                          <button
                            type="button"
                            className={ratioSaveDeckClass()}
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
                <p className="mb-2 py-2 pb-3 text-sm leading-normal text-muted">
                  No ranked lists stored for this version group yet.
                </p>
              )}

            {groupRuns.length > 0 && (
              <div className="mt-2">
                <p className={cn(typeSubsectionLabel, "mb-2.5")}>
                  RUNS IN THIS GROUP
                </p>
                <div className={historyPanelTableWrapClass}>
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Hands</th>
                        <th>Runtime</th>
                        <th>Status</th>
                        <th>Best score</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRuns.map((run) => (
                        <tr key={run.id}>
                          <td>{formatWhen(run.startedAt)}</td>
                          <td className={historyMonoCellClass}>
                            {run.samples != null ? String(run.samples) : "—"}
                          </td>
                          <td className={historyMonoCellClass}>
                            {formatRunTime(run.elapsedMs)}
                          </td>
                          <td>
                            <StatusBadge
                              status={run.status}
                              errorMessage={run.errorMessage}
                            />
                          </td>
                          <td className={historyResultCellClass}>
                            {run.bestScore != null
                              ? run.bestScore.toFixed(2)
                              : "—"}
                          </td>
                          <td className="w-[1%] whitespace-nowrap text-right">
                            <button
                              type="button"
                              className={buttonVariants({ intent: "text" })}
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
          <p
            className="mt-5 border-l-4 border-primary bg-[color-mix(in_srgb,var(--color-primary)_10%,white)] px-[15px] py-3"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
