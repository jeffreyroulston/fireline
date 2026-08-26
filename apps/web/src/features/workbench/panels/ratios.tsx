"use client";

import { CARDS, PLAYABLE_CARD_IDS, formatDecklistCount, parseDecklist, type CardId, type DeckCounts, type OptimizeBounds } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { MAX_RATIO_DECK_ATTEMPTS } from "@/lib/engine";
import type { RatioResult } from "./types";

export function RatioImportPanel({
  ratioImportText,
  activeDeck,
  onImportTextChange,
  onApply,
  onApplyActiveDeck,
  onResetBounds,
}: {
  ratioImportText: string;
  activeDeck: SavedDeck | null;
  onImportTextChange: (text: string) => void;
  onApply: () => void;
  onApplyActiveDeck: () => void;
  onResetBounds: () => void;
}) {
  return (
    <div className="ratio-import">
      <div className="section-heading">
        <span>IMPORT DECKLIST</span>
        <strong>{parseDecklist(ratioImportText).length} recognized</strong>
      </div>
      <label className="deck-input ratio-import-input">
        Paste a list to lock min = max for each card
        <textarea
          value={ratioImportText}
          onChange={(event) => onImportTextChange(event.target.value)}
          placeholder={`4 Arthur, Young Heir\n3 Ignited Stab\n…`}
          spellCheck={false}
        />
      </label>
      <div className="ratio-import-actions">
        <button
          type="button"
          className="secondary-action"
          onClick={onApply}
        >
          Apply to bounds
        </button>
        {activeDeck && (
          <button
            type="button"
            className="text-action"
            onClick={onApplyActiveDeck}
          >
            Use “{activeDeck.name}”
          </button>
        )}
        <button
          type="button"
          className="text-action"
          onClick={onResetBounds}
        >
          Reset bounds
        </button>
      </div>
    </div>
  );
}

export function BoundsTable({
  bounds,
  onBoundsChange,
}: {
  bounds: OptimizeBounds;
  onBoundsChange: (
    updater: (current: OptimizeBounds) => OptimizeBounds,
  ) => void;
}) {
  return (
    <div className="bounds-table">
      <div className="bounds-head">
        <span>Card</span>
        <span>Minimum</span>
        <span>Maximum</span>
      </div>
      {[...PLAYABLE_CARD_IDS]
        .sort((a, b) => CARDS[a].name.localeCompare(CARDS[b].name))
        .map((id) => (
          <div className="bounds-row" key={id}>
            <span>
              <b>{CARDS[id].name}</b>
              <small>{CARDS[id].kind}</small>
            </span>
            <input
              aria-label={`${CARDS[id].name} minimum`}
              type="number"
              min={0}
              max={bounds[id].max}
              value={bounds[id].min}
              onChange={(event) =>
                onBoundsChange((current) => ({
                  ...current,
                  [id]: {
                    ...current[id],
                    min: Number(event.target.value),
                  },
                }))
              }
            />
            <input
              aria-label={`${CARDS[id].name} maximum`}
              type="number"
              min={bounds[id].min}
              max={6}
              value={bounds[id].max}
              onChange={(event) =>
                onBoundsChange((current) => ({
                  ...current,
                  [id]: {
                    ...current[id],
                    max: Number(event.target.value),
                  },
                }))
              }
            />
          </div>
        ))}
    </div>
  );
}

export function PermutationPanel({
  legalDecklists,
  boundMinTotal,
  boundMaxTotal,
  deckSize,
  freeCopies,
  deckAttempts,
  attemptCeiling,
  coveragePercent,
  onDeckAttemptsChange,
}: {
  legalDecklists: bigint;
  boundMinTotal: number;
  boundMaxTotal: number;
  deckSize: number;
  freeCopies: number;
  deckAttempts: number;
  attemptCeiling: number;
  coveragePercent: number;
  onDeckAttemptsChange: (value: number) => void;
}) {
  return (
    <div className="permutation-panel">
      <div className="permutation-meta">
        <span>LEGAL LISTS</span>
        <strong>{formatDecklistCount(legalDecklists)}</strong>
        <small>
          Bounds {boundMinTotal}–{boundMaxTotal} · deck {deckSize} · {freeCopies}{" "}
          free {freeCopies === 1 ? "copy" : "copies"}
        </small>
        <small>
          {legalDecklists === BigInt(0)
            ? "Deck size is outside the bound totals"
            : freeCopies === 0
              ? "Minimums already fill the deck — lower some mins (and raise other maxes) to open the space"
              : legalDecklists === BigInt(1)
                ? "Only one mix fits — widen gaps on more than one card"
                : legalDecklists > BigInt(MAX_RATIO_DECK_ATTEMPTS)
                  ? `Showing a unique sample · browser cap ${MAX_RATIO_DECK_ATTEMPTS}`
                  : "Space is small enough to cover fully"}
        </small>
      </div>
      <div
        className="permutation-track"
        aria-label={`${deckAttempts} of ${formatDecklistCount(legalDecklists)} lists · ${coveragePercent.toFixed(2)}% of full space`}
      >
        <span style={{ width: `${coveragePercent}%` }} />
      </div>
      <label className="permutation-slider">
        <span>
          Decks to try · {deckAttempts}
          {attemptCeiling > 0 ? ` / ${attemptCeiling}` : ""}
          {" · "}
          {coveragePercent < 0.01 && deckAttempts > 0
            ? "<0.01"
            : coveragePercent.toFixed(2)}
          % of legal
        </span>
        <input
          type="range"
          min={1}
          max={Math.max(1, attemptCeiling)}
          value={Math.min(deckAttempts, Math.max(1, attemptCeiling))}
          disabled={attemptCeiling < 1}
          onChange={(event) => onDeckAttemptsChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

export function RatioControls({
  deckSize,
  ratioSamples,
  metric,
  onDeckSizeChange,
  onRatioSamplesChange,
  onMetricChange,
}: {
  deckSize: number;
  ratioSamples: number;
  metric: "mean" | "p50";
  onDeckSizeChange: (value: number) => void;
  onRatioSamplesChange: (value: number) => void;
  onMetricChange: (value: "mean" | "p50") => void;
}) {
  return (
    <div className="ratio-controls">
      <label>
        Deck size
        <input
          type="number"
          min={7}
          max={60}
          value={deckSize}
          onChange={(event) => onDeckSizeChange(Number(event.target.value))}
        />
      </label>
      <label>
        Hands / list
        <input
          type="number"
          min={1}
          max={30}
          value={ratioSamples}
          onChange={(event) => onRatioSamplesChange(Number(event.target.value))}
        />
      </label>
      <label>
        Optimize
        <select
          value={metric}
          onChange={(event) =>
            onMetricChange(event.target.value as "mean" | "p50")
          }
        >
          <option value="mean">Mean damage</option>
          <option value="p50">Median damage</option>
        </select>
      </label>
    </div>
  );
}

export function RatioResults({
  result,
  onSaveDecklist,
}: {
  result: RatioResult | null;
  onSaveDecklist: (counts: DeckCounts, score: number, rank: number) => void;
}) {
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

  return (
    <section className="ratio-results" aria-live="polite">
      <div className="ratio-results-lead">
        <span>BEST SCORE</span>
        <strong>{result.bestScore.toFixed(2)}</strong>
        <small>Top {top.length} distinct lists</small>
      </div>
      <ol className="ratio-rankings">
        {top.map((entry) => (
          <li key={`rank-${entry.rank}-${entry.score}`}>
            <header>
              <span>#{entry.rank}</span>
              <strong>{entry.score.toFixed(2)}</strong>
            </header>
            <ul>
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
            <button
              type="button"
              className="ratio-save-deck"
              onClick={() =>
                onSaveDecklist(entry.counts, entry.score, entry.rank)
              }
            >
              Save decklist
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
