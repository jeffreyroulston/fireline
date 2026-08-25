"use client";

import { useEffect, useState } from "react";
import { CARDS, type CardId, type SimType } from "@/lib/engine";
import {
  fetchCardLeaderboard,
  fetchPooledDamage,
  fetchRankedCandidates,
  fetchRunHistory,
  fetchVersionGroups,
  type CardLeaderboardResponse,
  type PooledDamageResponse,
  type RankedCandidatesResponse,
  type RunHistoryRow,
  type VersionGroup,
} from "@/lib/api/client";
import type { SavedDeck } from "@/lib/decks";
import { SIM_TYPE_LABELS } from "./types";

function formatVersion(group: VersionGroup): string {
  return `r${group.rulesVersion} · s${group.samplerVersion} · d${group.cardDigest.slice(0, 8)}… · a${group.attributionVersion ?? "?"}`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function HistoryPanel({
  activeDeck,
  filterToActiveDeck,
  onFilterToActiveDeckChange,
}: {
  activeDeck: SavedDeck | null;
  filterToActiveDeck: boolean;
  onFilterToActiveDeckChange: (value: boolean) => void;
}) {
  const [runs, setRuns] = useState<RunHistoryRow[]>([]);
  const [groups, setGroups] = useState<VersionGroup[]>([]);
  const [simType, setSimType] = useState<SimType>("fire_brick");
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [pooled, setPooled] = useState<PooledDamageResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<CardLeaderboardResponse | null>(
    null,
  );
  const [candidates, setCandidates] = useState<RankedCandidatesResponse | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const deckHash =
    filterToActiveDeck && activeDeck ? activeDeck.deckHash : undefined;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const history = await fetchRunHistory(deckHash);
        if (!cancelled) {
          setRuns(history);
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
  }, [deckHash]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextGroups = await fetchVersionGroups({
          deckHash,
          simType,
          kind: "evaluate",
        });
        if (!cancelled) {
          setGroups(nextGroups);
          setSelectedGroupKey("");
          setPooled(null);
          setLeaderboard(null);
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
  }, [deckHash, simType]);

  useEffect(() => {
    if (!selectedGroupKey || !deckHash) {
      setPooled(null);
      setLeaderboard(null);
      setCandidates(null);
      return;
    }
    const group = groups.find(
      (item) =>
        `${item.rulesVersion}:${item.samplerVersion}:${item.cardDigest}:${item.attributionVersion}` ===
        selectedGroupKey,
    );
    if (!group || group.attributionVersion == null) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [poolResult, boardResult, candidateResult] = await Promise.all([
          fetchPooledDamage({
            deckHash,
            simType,
            rulesVersion: group.rulesVersion,
            samplerVersion: group.samplerVersion,
            cardDigest: group.cardDigest,
          }),
          fetchCardLeaderboard({
            deckHash,
            simType,
            rulesVersion: group.rulesVersion,
            samplerVersion: group.samplerVersion,
            cardDigest: group.cardDigest,
            attributionVersion: group.attributionVersion!,
          }),
          fetchRankedCandidates({
            rulesVersion: group.rulesVersion,
            samplerVersion: group.samplerVersion,
            cardDigest: group.cardDigest,
          }),
        ]);
        if (!cancelled) {
          setPooled(poolResult);
          setLeaderboard(boardResult);
          setCandidates(candidateResult);
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
  }, [selectedGroupKey, deckHash, simType, groups]);

  const maxBucketCount = Math.max(...(pooled?.distribution?.buckets ?? [1]), 1);

  return (
    <div className="history-mode">
      <div className="ratio-topline">
        <p className="kicker">CROSS-RUN ANALYSIS</p>
        <p>
          Pool completed runs only within the same engine version triple. Never
          mix simulation types on one chart.
        </p>
      </div>

      <div className="history-controls settings-row">
        <label>
          Scope
          <select
            value={filterToActiveDeck ? "active" : "all"}
            onChange={(event) =>
              onFilterToActiveDeckChange(event.target.value === "active")
            }
          >
            <option value="all">All decks</option>
            <option value="active" disabled={!activeDeck}>
              Active deck only
            </option>
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
            value={selectedGroupKey}
            disabled={!deckHash || groups.length === 0}
            onChange={(event) => setSelectedGroupKey(event.target.value)}
          >
            <option value="">
              {deckHash
                ? groups.length > 0
                  ? "Select a version triple"
                  : "No completed runs for this filter"
                : "Choose active-deck scope to pool"}
            </option>
            {groups.map((group) => {
              const key = `${group.rulesVersion}:${group.samplerVersion}:${group.cardDigest}:${group.attributionVersion}`;
              return (
                <option key={key} value={key}>
                  {formatVersion(group)} · {group.runCount} runs
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <section className="history-runs">
        <div className="section-heading">
          <span>RUN HISTORY</span>
          <strong>{runs.length} rows</strong>
        </div>
        <div className="card-stats-table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
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
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                  <td>{run.kind}</td>
                  <td>{run.simType ?? "—"}</td>
                  <td>{run.status}</td>
                  <td>
                    {run.rulesVersion != null
                      ? `r${run.rulesVersion}/s${run.samplerVersion}/a${run.attributionVersion}`
                      : "—"}
                  </td>
                  <td>
                    {run.kind === "optimize"
                      ? run.bestScore?.toFixed(2)
                      : run.meanDamage?.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {loading && <p className="sim-hint">Loading pooled analysis…</p>}

      {pooled?.distribution && (
        <section className="history-pooled">
          <div className="section-heading">
            <span>POOLED DAMAGE</span>
            <strong>{pooled.runCount} runs · {pooled.distribution.totalSamples} samples</strong>
          </div>
          <div className="stat-line">
            <span>
              <small>MEAN</small>
              <b>{pooled.distribution.mean.toFixed(1)}</b>
            </span>
            <span>
              <small>P50</small>
              <b>{pooled.distribution.p50}</b>
            </span>
            <span>
              <small>P90</small>
              <b>{pooled.distribution.p90}</b>
            </span>
            <span>
              <small>RANGE</small>
              <b>
                {pooled.distribution.min}–{pooled.distribution.max}
              </b>
            </span>
          </div>
          <div className="damage-bars short" aria-label="Pooled damage histogram">
            {pooled.distribution.buckets.map((count, damage) =>
              count > 0 ? (
                <span
                  key={`pool-${damage}`}
                  style={{
                    height: `${Math.max(4, (count / maxBucketCount) * 100)}%`,
                  }}
                  title={`${damage} damage · ${count} samples`}
                />
              ) : null,
            )}
          </div>
        </section>
      )}

      {leaderboard && leaderboard.cards.length > 0 && (
        <section className="history-leaderboard">
          <div className="section-heading">
            <span>CARD LEADERBOARD</span>
            <strong>{leaderboard.totalSamples} pooled samples</strong>
          </div>
          <div className="card-stats-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Seen</th>
                  <th>Play|seen</th>
                  <th>Dmg|seen</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.cards.map((row) => (
                  <tr key={row.cardId}>
                    <td>{CARDS[row.cardId as CardId]?.name ?? row.cardId}</td>
                    <td>{formatPct(row.seeRate)}</td>
                    <td>{row.playWhenSeen.toFixed(2)}</td>
                    <td>{row.damageWhenSeen.toFixed(1)}</td>
                    <td>{formatPct(row.damageShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {candidates && candidates.candidates.length > 0 && (
        <section className="history-candidates">
          <div className="section-heading">
            <span>RATIO WINNERS ACROSS SEEDS</span>
            <strong>{candidates.candidates.length} lists</strong>
          </div>
          <ol className="ratio-rankings">
            {candidates.candidates.slice(0, 10).map((entry) => (
              <li key={entry.deckHash}>
                <header>
                  <span>#{entry.rank}</span>
                  <strong>
                    {entry.wins}/{entry.appearances} wins · avg{" "}
                    {entry.avgScore.toFixed(2)}
                  </strong>
                </header>
              </li>
            ))}
          </ol>
        </section>
      )}

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
