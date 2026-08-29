"use client";

import { useEffect, useState } from "react";
import { CARDS, PLAYABLE_CARD_IDS, type CardId, type DeckCounts } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { SectionHeading } from "../../ui";
import type { RatioRefineCriteria, RatioResult } from "../../types";
import { REFINE_COPY_CEILING } from "../../utils";
import {
  deckDiffEntries,
  ratioRankingHeaderClass,
  ratioRankingItemClass,
} from "./shared";
import { RatioCandidateDetail } from "./ratio-candidate-detail";

type RatioResultsProps = Readonly<{
  result: RatioResult | null;
  criteria: RatioRefineCriteria | null;
  samples: number;
  onSaveDecklist: (counts: DeckCounts, score: number, rank: number) => void;
}>;

export function RatioResults({
  result,
  criteria,
  samples,
  onSaveDecklist,
}: RatioResultsProps) {
  const [selectedRank, setSelectedRank] = useState<number | null>(null);

  useEffect(() => {
    setSelectedRank(null);
  }, [result]);

  if (!result) return null;

  const top =
    result.top && result.top.length > 0
      ? result.top
      : [
          {
            rank: 1,
            score: result.bestScore,
            counts: result.bestCounts,
          },
        ];

  const baseCounts = criteria?.baseCounts ?? result.bestCounts;
  const selectedEntry =
    selectedRank != null
      ? top.find((entry) => entry.rank === selectedRank) ?? null
      : null;

  const cutRows = criteria
    ? PLAYABLE_CARD_IDS.filter((id) => (criteria.cutBudgets[id] ?? 0) > 0)
        .map((id) => ({
          id,
          inList: criteria.baseCounts[id] ?? 0,
          cutUpTo: criteria.cutBudgets[id] ?? 0,
        }))
        .sort((a, b) => CARDS[a.id].name.localeCompare(CARDS[b.id].name))
    : [];
  const addRows = criteria
    ? PLAYABLE_CARD_IDS.filter((id) => criteria.replacements[id] != null)
        .map((id) => ({
          id,
          inList: criteria.baseCounts[id] ?? 0,
          max: criteria.replacements[id] ?? REFINE_COPY_CEILING,
        }))
        .sort((a, b) => CARDS[a.id].name.localeCompare(CARDS[b.id].name))
    : [];

  return (
    <section
      className="mt-[30px] grid gap-7 bg-foreground p-7 text-white"
      aria-live="polite"
    >
      {criteria && !selectedEntry && (
        <div className="grid gap-3.5 border-b border-white/14 pb-[22px]">
          <SectionHeading
            className="text-white/72 [&_strong]:text-white/55"
            title="TEST CRITERIA"
            meta={
              <strong>
                {cutRows.length} cut · {addRows.length} add
              </strong>
            }
          />
          <div className="grid grid-cols-2 gap-[22px] max-[620px]:grid-cols-1">
            <div>
              <p className="mb-2.5 font-mono text-[10px] tracking-[0.08em] text-white/55 uppercase">
                Could be lowered
              </p>
              {cutRows.length === 0 ? (
                <p className="m-0 text-[13px] text-white/40">No cut cards.</p>
              ) : (
                <ul className="grid list-none gap-2 p-0">
                  {cutRows.map((row) => (
                    <li
                      key={`cut-${row.id}`}
                      className="grid grid-cols-[42px_1fr] items-start gap-2.5 text-[13px]"
                    >
                      <b className="font-mono text-xs text-primary">
                        −{row.cutUpTo}×
                      </b>
                      <span className="grid min-w-0 gap-0.5">
                        {CARDS[row.id].name}
                        <small className="font-mono text-[10px] tracking-wide text-white/45">
                          {row.inList}× in base
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2.5 font-mono text-[10px] tracking-[0.08em] text-white/55 uppercase">
                Could be added
              </p>
              {addRows.length === 0 ? (
                <p className="m-0 text-[13px] text-white/40">No replacement cards.</p>
              ) : (
                <ul className="grid list-none gap-2 p-0">
                  {addRows.map((row) => (
                    <li
                      key={`add-${row.id}`}
                      className="grid grid-cols-[42px_1fr] items-start gap-2.5 text-[13px]"
                    >
                      <b className="font-mono text-xs text-primary">≤{row.max}×</b>
                      <span className="grid min-w-0 gap-0.5">
                        {CARDS[row.id].name}
                        <small className="font-mono text-[10px] tracking-wide text-white/45">
                          {row.inList > 0
                            ? `was ${row.inList}× in base`
                            : "not in base"}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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
              Top {top.length} distinct lists
            </small>
          </div>
          <ol className="grid list-none grid-cols-1 gap-3 p-0">
            {top.map((entry) => {
              const changes = deckDiffEntries(baseCounts, entry.counts);
              return (
                <li key={`rank-${entry.rank}-${entry.score}`}>
                  <button
                    type="button"
                    className={cn(
                      ratioRankingItemClass,
                      "w-full cursor-pointer text-left transition-colors hover:border-white/35 hover:bg-white/[0.07]",
                    )}
                    onClick={() => setSelectedRank(entry.rank)}
                  >
                    <header className={ratioRankingHeaderClass}>
                      <span className="font-mono text-[11px] tracking-[0.08em] text-white/55">
                        #{entry.rank}
                      </span>
                      <strong className="font-display text-[32px] leading-none text-primary">
                        {entry.score.toFixed(2)}
                      </strong>
                    </header>
                    <p className="m-0 font-mono text-[10px] tracking-[0.06em] text-white/55 uppercase">
                      {changes.length === 0
                        ? "No count changes vs base"
                        : `${changes.length} change${changes.length === 1 ? "" : "s"} vs base`}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
