"use client";

import { useEffect, useMemo, useState } from "react";
import { SecondaryActionButton } from "@/components/secondary-action-button";
import { CARDS, PLAYABLE_CARD_IDS, type DeckCounts } from "@/lib/engine";
import { cn } from "@/lib/utils";
import type { RatioRefineCriteria, RatioResult } from "../../types";
import { REFINE_COPY_CEILING } from "../../utils";
import {
  findBaselineEntry,
  findBestChangedEntry,
  ratioResultsPanelClass,
  ratioResultsSectionClass,
  ratioSaveDeckClass,
} from "./shared";
import { RatioCandidateDetail } from "./ratio-candidate-detail";
import { RatioCriteriaCards } from "./ratio-criteria-cards";
import { RatioRankingRow } from "./ratio-ranking-row";
import { RatioScoreSummary } from "./ratio-score-summary";
import {
  ratioResultRowId,
  useRatioResultSelection,
} from "./use-ratio-result-selection";

type RatioResultsProps = Readonly<{
  result: RatioResult | null;
  criteria: RatioRefineCriteria | null;
  samples: number;
  onSaveDecklist: (counts: DeckCounts, score: number, rank: number) => void;
  onRetestSelected?: (decks: DeckCounts[]) => void;
  retestBusy?: boolean;
}>;

export function RatioResults({
  result,
  criteria,
  samples,
  onSaveDecklist,
  onRetestSelected,
  retestBusy = false,
}: RatioResultsProps) {
  const { selectedRank, selectRank, returnToList } =
    useRatioResultSelection(result);
  const [topListCount, setTopListCount] = useState(5);
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(
    () => new Set(),
  );

  const allTop = useMemo(() => {
    if (!result) {
      return [];
    }
    return result.top && result.top.length > 0
      ? result.top
      : [
          {
            rank: 1,
            score: result.bestScore,
            counts: result.bestCounts,
          },
        ];
  }, [result]);

  const top = useMemo(
    () =>
      allTop.slice(
        0,
        Math.min(Math.max(1, topListCount), Math.max(allTop.length, 1)),
      ),
    [allTop, topListCount],
  );

  useEffect(() => {
    if (!result || allTop.length === 0) {
      return;
    }
    setTopListCount(allTop.length);
  }, [result, allTop.length]);

  useEffect(() => {
    setSelectedRanks(new Set());
  }, [result]);

  useEffect(() => {
    setSelectedRanks((current) => {
      const visible = new Set(top.map((entry) => entry.rank));
      const next = new Set(
        [...current].filter((rank) => visible.has(rank)),
      );
      return next.size === current.size ? current : next;
    });
  }, [top]);

  if (!result) return null;

  const isMultiDeck = result.strategy === "multiDeck";
  const baseCounts = criteria?.baseCounts ?? result.bestCounts;
  const selectedEntry =
    selectedRank != null
      ? allTop.find((entry) => entry.rank === selectedRank) ?? null
      : null;

  const cutRows = criteria && !isMultiDeck
    ? PLAYABLE_CARD_IDS.filter((id) => (criteria.cutBudgets[id] ?? 0) > 0)
        .map((id) => ({
          id,
          inList: criteria.baseCounts[id] ?? 0,
          cutUpTo: criteria.cutBudgets[id] ?? 0,
        }))
        .sort((a, b) => CARDS[a.id].name.localeCompare(CARDS[b.id].name))
    : [];
  const addRows = criteria && !isMultiDeck
    ? PLAYABLE_CARD_IDS.filter((id) => criteria.replacements[id] != null)
        .map((id) => ({
          id,
          inList: criteria.baseCounts[id] ?? 0,
          max: criteria.replacements[id] ?? REFINE_COPY_CEILING,
        }))
        .sort((a, b) => CARDS[a.id].name.localeCompare(CARDS[b.id].name))
    : [];
  const baselineEntry = isMultiDeck
    ? null
    : findBaselineEntry(allTop, baseCounts);
  const baselineScore = baselineEntry?.score ?? null;
  const bestChangedEntry = isMultiDeck
    ? allTop[0] ?? null
    : findBestChangedEntry(allTop, baseCounts);
  const bestChangedScore = bestChangedEntry?.score ?? null;
  const lowestScore =
    isMultiDeck && allTop.length > 0
      ? allTop[allTop.length - 1]?.score ?? null
      : null;
  const canRetest = onRetestSelected != null;
  const selectedCount = selectedRanks.size;
  const allVisibleSelected =
    top.length > 0 && top.every((entry) => selectedRanks.has(entry.rank));

  function toggleRank(rank: number) {
    setSelectedRanks((current) => {
      const next = new Set(current);
      if (next.has(rank)) {
        next.delete(rank);
      } else {
        next.add(rank);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedRanks(new Set(top.map((entry) => entry.rank)));
  }

  function clearSelection() {
    setSelectedRanks(new Set());
  }

  function handleRetestSelected() {
    if (!onRetestSelected || selectedCount === 0) {
      return;
    }
    const decks = allTop
      .filter((entry) => selectedRanks.has(entry.rank))
      .map((entry) => entry.counts);
    onRetestSelected(decks);
  }

  return (
    <section className={ratioResultsSectionClass} aria-live="polite">
      {criteria && !selectedEntry && (
        <RatioCriteriaCards cutRows={cutRows} addRows={addRows} />
      )}

      {selectedEntry ? (
        <RatioCandidateDetail
          entry={selectedEntry}
          baseCounts={baseCounts}
          baselineScore={baselineScore}
          bestScore={bestChangedScore}
          variant={isMultiDeck ? "multiDeck" : "search"}
          samples={samples}
          onBack={returnToList}
          onSaveDecklist={onSaveDecklist}
        />
      ) : (
        <div className={ratioResultsPanelClass}>
          <RatioScoreSummary
            variant={isMultiDeck ? "multiDeck" : "search"}
            bestScore={bestChangedScore}
            baselineScore={baselineScore}
            lowestScore={lowestScore}
            topListCount={topListCount}
            maxTopListCount={allTop.length}
            onTopListCountChange={setTopListCount}
          />

          {canRetest && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={ratioSaveDeckClass()}
                disabled={selectedCount === 0 || retestBusy}
                onClick={handleRetestSelected}
              >
                Re-test {selectedCount > 0 ? selectedCount : ""} selected
              </button>
              <SecondaryActionButton
                className="w-auto shrink-0"
                disabled={top.length === 0 || retestBusy}
                onClick={allVisibleSelected ? clearSelection : selectAllVisible}
              >
                {allVisibleSelected ? "Clear selection" : "Select visible"}
              </SecondaryActionButton>
              <span className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
                Queues lists into multi-deck test
              </span>
            </div>
          )}

          <ol className="grid list-none grid-cols-1 gap-3 p-0">
            {top.map((entry) => {
              const isSelected = selectedRanks.has(entry.rank);
              return (
                <li
                  key={`rank-${entry.rank}-${entry.score}`}
                  id={ratioResultRowId(entry.rank)}
                  className={cn(
                    canRetest && "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3",
                  )}
                >
                  {canRetest && (
                    <label className="mt-4 flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-accent)]"
                        checked={isSelected}
                        disabled={retestBusy}
                        aria-label={`Select #${entry.rank} for re-test`}
                        onChange={() => toggleRank(entry.rank)}
                      />
                    </label>
                  )}
                  <RatioRankingRow
                    entry={entry}
                    baseCounts={baseCounts}
                    baseDeckName={criteria?.baseDeckName}
                    baselineScore={baselineScore}
                    bestScore={bestChangedScore}
                    variant={isMultiDeck ? "multiDeck" : "search"}
                    interactive
                    onClick={() => selectRank(entry.rank)}
                    className={cn(
                      canRetest &&
                        isSelected &&
                        "border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-surface))]",
                    )}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
