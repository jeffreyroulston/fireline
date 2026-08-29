"use client";

import { useMemo } from "react";
import { CARDS, type CardId, type CardStat, type DeckCounts } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  CardLeaderboardPanel,
  leaderboardFromCardStats,
} from "../card-leaderboard";
import {
  deckDiffEntries,
  formatSignedCopies,
  ratioChangeRowClass,
  ratioChangesClass,
  ratioRankingHeaderClass,
  ratioSaveDeckClass,
} from "./shared";

export type RatioCandidateEntry = Readonly<{
  rank: number;
  score: number;
  counts: DeckCounts;
  scoreDelta?: number | null;
  candidate?: string | null;
  cardStats?: CardStat[];
}>;

type RatioCandidateDetailProps = Readonly<{
  entry: RatioCandidateEntry;
  baseCounts: DeckCounts;
  samples: number;
  onBack: () => void;
  onSaveDecklist: (counts: DeckCounts, score: number, rank: number) => void;
}>;

export function RatioCandidateDetail({
  entry,
  baseCounts,
  samples,
  onBack,
  onSaveDecklist,
}: RatioCandidateDetailProps) {
  const changes = useMemo(
    () => deckDiffEntries(baseCounts, entry.counts),
    [baseCounts, entry.counts],
  );

  const leaderboard = useMemo(
    () =>
      entry.cardStats && entry.cardStats.length > 0
        ? leaderboardFromCardStats(entry.cardStats, samples)
        : null,
    [entry.cardStats, samples],
  );

  const candidateName =
    entry.candidate != null
      ? (CARDS[entry.candidate as CardId]?.name ?? entry.candidate)
      : null;

  return (
    <div className="grid gap-7">
      <button
        type="button"
        className="justify-self-start font-mono text-[11px] tracking-[0.06em] text-white/55 uppercase hover:text-primary"
        onClick={onBack}
      >
        ← Back to summary
      </button>

      <article className="grid gap-4 border border-white/17 bg-white/[0.04] p-4">
        <header className={ratioRankingHeaderClass}>
          <div className="grid gap-1">
            <span className="font-mono text-[11px] tracking-[0.08em] text-white/55">
              {entry.rank === 0 ? "Baseline" : `#${entry.rank}`}
              {candidateName ? ` · ${candidateName}` : ""}
            </span>
            <strong className="font-display text-[42px] leading-none text-primary">
              {entry.score.toFixed(2)}
            </strong>
          </div>
          {entry.scoreDelta != null && (
            <span
              className={cn(
                "font-mono text-sm",
                entry.scoreDelta >= 0 ? "text-[#9ed4a8]" : "text-[#f0a090]",
              )}
            >
              {entry.scoreDelta >= 0 ? "+" : ""}
              {entry.scoreDelta.toFixed(2)} vs base
            </span>
          )}
        </header>

        <div className={ratioChangesClass}>
          <p className="m-0 font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
            {changes.length === 0
              ? "No count changes vs base"
              : `${changes.length} change${changes.length === 1 ? "" : "s"} vs base`}
          </p>
          {changes.length > 0 && (
            <ul className="grid list-none gap-1.5 p-0">
              {changes.map((change) => (
                <li
                  key={`detail-Δ-${change.id}`}
                  className={cn(
                    ratioChangeRowClass,
                    change.delta > 0
                      ? "[&_b]:text-[#9ed4a8]"
                      : "[&_b]:text-[#f0a090]",
                  )}
                >
                  <b className="font-mono">{formatSignedCopies(change.delta)}</b>
                  <span className="grid min-w-0 gap-0.5">
                    {CARDS[change.id]?.name ?? change.id}
                    <small className="font-mono text-[10px] text-white/45">
                      {change.from}× → {change.to}×
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          className={ratioSaveDeckClass()}
          onClick={() =>
            onSaveDecklist(entry.counts, entry.score, entry.rank)
          }
        >
          Save decklist
        </button>
      </article>

      <div className="-mx-7 border-t border-white/14 bg-surface px-7 py-7 text-foreground">
        {leaderboard ? (
          <CardLeaderboardPanel leaderboard={leaderboard} />
        ) : (
          <p className="m-0 font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
            No card stats for this candidate.
          </p>
        )}
      </div>
    </div>
  );
}
