"use client";

import { useEffect, useState } from "react";
import { CARDS, type CardId, type DeckCounts } from "@/lib/engine";
import { cn } from "@/lib/utils";
import type { RatioResult } from "../../types";
import { ratioSaveDeckClass } from "./shared";
import { RatioCandidateDetail } from "./ratio-candidate-detail";

function candidateStat(
  cardStats:
    | { card: string; playRate: number; openRate: number; seeRate: number }[]
    | undefined,
  cardId: string,
) {
  if (!cardStats) return null;
  return cardStats.find((row) => row.card === cardId) ?? null;
}

type SwapSweepResultsProps = Readonly<{
  result: RatioResult;
  samples: number;
  onSaveDecklist: (counts: DeckCounts, score: number, rank: number) => void;
}>;

export function SwapSweepResults({
  result,
  samples,
  onSaveDecklist,
}: SwapSweepResultsProps) {
  const [selectedRank, setSelectedRank] = useState<number | null>(null);

  useEffect(() => {
    setSelectedRank(null);
  }, [result]);

  const rows = result.top ?? [];
  const baseline = rows.find((row) => row.rank === 0);
  const candidates = rows.filter((row) => row.rank > 0);
  const baseCounts = baseline?.counts ?? result.bestCounts;
  const selectedEntry =
    selectedRank != null
      ? rows.find((row) => row.rank === selectedRank) ?? null
      : null;

  return (
    <section
      className="mt-[30px] grid gap-7 bg-foreground p-7 text-white"
      aria-live="polite"
    >
      {selectedEntry ? (
        <RatioCandidateDetail
          entry={selectedEntry}
          baseCounts={baseCounts}
          samples={samples}
          onBack={() => setSelectedRank(null)}
          onSaveDecklist={onSaveDecklist}
        />
      ) : (
        <div className="grid grid-cols-[minmax(160px,190px)_1fr] gap-[35px] max-[620px]:grid-cols-1">
          <div className="grid content-start gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.08em] text-white/55 uppercase">
              BEST SCORE
            </span>
            <strong className="font-display text-[78px] leading-none text-primary">
              {result.bestScore.toFixed(2)}
            </strong>
            <small className="font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
              {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
              {baseline ? ` · baseline ${baseline.score.toFixed(2)}` : ""}
            </small>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-white/17 px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
                    Candidate
                  </th>
                  <th className="border-b border-white/17 px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
                    Score
                  </th>
                  <th className="border-b border-white/17 px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
                    Δ vs base
                  </th>
                  <th className="border-b border-white/17 px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
                    Play rate
                  </th>
                  <th className="border-b border-white/17 px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
                    Open rate
                  </th>
                  <th className="border-b border-white/17 px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
                    See rate
                  </th>
                  <th className="border-b border-white/17 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {baseline && (
                  <tr
                    className={cn(
                      "cursor-pointer text-muted transition-colors hover:bg-white/[0.06]",
                    )}
                    onClick={() => setSelectedRank(0)}
                  >
                    <td className="border-b border-white/17 px-3 py-2.5 text-left">
                      <em>Baseline</em>
                    </td>
                    <td className="border-b border-white/17 px-3 py-2.5 text-left">
                      {baseline.score.toFixed(2)}
                    </td>
                    <td className="border-b border-white/17 px-3 py-2.5 text-left">
                      —
                    </td>
                    <td
                      className="border-b border-white/17 px-3 py-2.5 text-left"
                      colSpan={3}
                    />
                    <td className="border-b border-white/17 px-3 py-2.5 text-left">
                      <button
                        type="button"
                        className={ratioSaveDeckClass(true)}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSaveDecklist(baseline.counts, baseline.score, 0);
                        }}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                )}
                {candidates.map((row) => {
                  const cardId = row.candidate ?? "";
                  const stat = candidateStat(row.cardStats, cardId);
                  return (
                    <tr
                      key={`${row.rank}-${cardId}`}
                      className="cursor-pointer transition-colors hover:bg-white/[0.06]"
                      onClick={() => setSelectedRank(row.rank)}
                    >
                      <td className="border-b border-white/17 px-3 py-2.5 text-left">
                        {CARDS[cardId as CardId]?.name ?? cardId}
                      </td>
                      <td className="border-b border-white/17 px-3 py-2.5 text-left">
                        {row.score.toFixed(2)}
                      </td>
                      <td className="border-b border-white/17 px-3 py-2.5 text-left">
                        {row.scoreDelta != null
                          ? `${row.scoreDelta >= 0 ? "+" : ""}${row.scoreDelta.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="border-b border-white/17 px-3 py-2.5 text-left">
                        {stat ? `${(stat.playRate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="border-b border-white/17 px-3 py-2.5 text-left">
                        {stat ? `${(stat.openRate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="border-b border-white/17 px-3 py-2.5 text-left">
                        {stat ? `${(stat.seeRate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="border-b border-white/17 px-3 py-2.5 text-left">
                        <button
                          type="button"
                          className={ratioSaveDeckClass(true)}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSaveDecklist(row.counts, row.score, row.rank);
                          }}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
