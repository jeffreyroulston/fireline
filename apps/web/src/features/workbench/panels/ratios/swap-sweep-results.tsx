"use client";

import { CARDS, type CardId, type DeckCounts } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { DamageReadout } from "../../ui";
import type { RatioResult } from "../../types";
import { historyTableWrapClass } from "../history/shared";
import {
  formatSignedScoreDelta,
  ratioResultsPanelClass,
  ratioResultsSectionClass,
  ratioSaveDeckClass,
  ratioScoreDeltaClass,
} from "./shared";
import { RatioCandidateDetail } from "./ratio-candidate-detail";
import {
  ratioResultRowId,
  useRatioResultSelection,
} from "./use-ratio-result-selection";

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
  const { selectedRank, selectRank, returnToList } =
    useRatioResultSelection(result);

  const isMultiDeck = result.strategy === "multiDeck";
  const rows = result.top ?? [];
  const baseline = isMultiDeck ? null : (rows.find((row) => row.rank === 0) ?? null);
  const candidates = isMultiDeck
    ? rows
    : rows.filter((row) => row.rank > 0);
  const baseCounts = baseline?.counts ?? result.bestCounts;
  const selectedEntry =
    selectedRank != null
      ? rows.find((row) => row.rank === selectedRank) ?? null
      : null;

  return (
    <section className={ratioResultsSectionClass} aria-live="polite">
      {selectedEntry ? (
        <RatioCandidateDetail
          entry={selectedEntry}
          baseCounts={baseCounts}
          baselineScore={baseline?.score ?? null}
          bestScore={result.bestScore}
          variant={isMultiDeck ? "multiDeck" : "search"}
          samples={samples}
          onBack={returnToList}
          onSaveDecklist={onSaveDecklist}
        />
      ) : (
        <div className={ratioResultsPanelClass}>
          <DamageReadout
            label="BEST SCORE"
            value={result.bestScore.toFixed(2)}
            detail={
              isMultiDeck ? (
                <>
                  {candidates.length} list
                  {candidates.length === 1 ? "" : "s"} ranked
                </>
              ) : (
                <>
                  {candidates.length} candidate
                  {candidates.length === 1 ? "" : "s"}
                  {baseline ? ` · baseline ${baseline.score.toFixed(2)}` : ""}
                </>
              )
            }
          />
          <div className={historyTableWrapClass}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-border px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
                    {isMultiDeck ? "List" : "Candidate"}
                  </th>
                  <th className="border-b border-border px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
                    Score
                  </th>
                  <th className="border-b border-border px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
                    {isMultiDeck ? "Δ vs best" : "Δ vs base"}
                  </th>
                  {!isMultiDeck && (
                    <>
                      <th className="border-b border-border px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
                        Play rate
                      </th>
                      <th className="border-b border-border px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
                        Open rate
                      </th>
                      <th className="border-b border-border px-3 py-2.5 text-left font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
                        See rate
                      </th>
                    </>
                  )}
                  <th className="border-b border-border px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {baseline && (
                  <tr
                    id={ratioResultRowId(0)}
                    className="cursor-pointer text-muted transition-colors hover:bg-surface-muted"
                    onClick={() => selectRank(0)}
                  >
                    <td className="border-b border-border px-3 py-2.5 text-left">
                      <em>Baseline</em>
                    </td>
                    <td className="border-b border-border px-3 py-2.5 text-left">
                      {baseline.score.toFixed(2)}
                    </td>
                    <td className="border-b border-border px-3 py-2.5 text-left">
                      —
                    </td>
                    <td
                      className="border-b border-border px-3 py-2.5 text-left"
                      colSpan={3}
                    />
                    <td className="border-b border-border px-3 py-2.5 text-left">
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
                  const delta = isMultiDeck
                    ? row.rank === 1
                      ? null
                      : row.score - result.bestScore
                    : row.scoreDelta;
                  return (
                    <tr
                      key={`${row.rank}-${cardId || "list"}`}
                      id={ratioResultRowId(row.rank)}
                      className="cursor-pointer transition-colors hover:bg-surface-muted"
                      onClick={() => selectRank(row.rank)}
                    >
                      <td className="border-b border-border px-3 py-2.5 text-left">
                        {isMultiDeck
                          ? `#${row.rank}`
                          : (CARDS[cardId as CardId]?.name ?? cardId)}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-left">
                        {row.score.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          "border-b border-border px-3 py-2.5 text-left font-mono text-[12px]",
                          delta != null
                            ? ratioScoreDeltaClass(delta)
                            : "text-muted",
                        )}
                      >
                        {delta != null ? formatSignedScoreDelta(delta) : "—"}
                      </td>
                      {!isMultiDeck && (
                        <>
                          <td className="border-b border-border px-3 py-2.5 text-left">
                            {stat ? `${(stat.playRate * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="border-b border-border px-3 py-2.5 text-left">
                            {stat ? `${(stat.openRate * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="border-b border-border px-3 py-2.5 text-left">
                            {stat ? `${(stat.seeRate * 100).toFixed(0)}%` : "—"}
                          </td>
                        </>
                      )}
                      <td className="border-b border-border px-3 py-2.5 text-left">
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
