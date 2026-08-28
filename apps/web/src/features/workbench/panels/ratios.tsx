"use client";

import {
  CARDS,
  MAX_RATIO_DECK_ATTEMPTS,
  MIN_VALID_DECK_SIZE,
  PLAYABLE_CARD_IDS,
  formatDecklistCount,
  type CardId,
  type DeckCounts,
} from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import type { OptimizeProgress } from "@/lib/api/useRun";
import { DeckPicker, OptimizeProgressPanel, SectionHeading } from "../ui";
import { progressPercent } from "../lib/progress-percent";
import type { RatioRefineCriteria, RatioResult } from "../types";
import { REFINE_COPY_CEILING } from "../utils";

function copyPartialCounts(
  counts: Partial<Record<CardId, number>>,
): Partial<Record<CardId, number>> {
  return { ...counts };
}

function copyDeckCounts(counts: DeckCounts): DeckCounts {
  return { ...counts };
}

export function snapshotRatioCriteria(
  baseDeckName: string,
  baseCounts: DeckCounts,
  cutBudgets: Partial<Record<CardId, number>>,
  replacements: Partial<Record<CardId, number>>,
): RatioRefineCriteria {
  return {
    baseDeckName: baseDeckName.trim() || "Base deck",
    baseCounts: copyDeckCounts(baseCounts),
    cutBudgets: copyPartialCounts(cutBudgets),
    replacements: copyPartialCounts(replacements),
  };
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

export function RatioDeckPicker({
  decks,
  activeDeck,
  recognizedCount,
  onSwitchDeck,
  decksLoading = false,
}: {
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedCount: number;
  onSwitchDeck: (deckId: string) => void;
  decksLoading?: boolean;
}) {
  return (
    <div className="ratio-deck-picker">
      <SectionHeading
        title="BASE DECK"
        meta={<strong>{recognizedCount} recognized</strong>}
      />
      <DeckPicker
        label="Saved deck to refine"
        decks={decks}
        value={activeDeck?.id ?? ""}
        onChange={onSwitchDeck}
        loading={decksLoading}
      />
      {recognizedCount > 0 && recognizedCount < MIN_VALID_DECK_SIZE && (
        <p className="ratio-refine-hint" role="status">
          Need at least {MIN_VALID_DECK_SIZE} recognized cards to sample ratios.
        </p>
      )}
    </div>
  );
}

export function CutBudgetPanel({
  baseCounts,
  cutBudgets,
  onCutBudgetChange,
}: {
  baseCounts: DeckCounts;
  cutBudgets: Partial<Record<CardId, number>>;
  onCutBudgetChange: (id: CardId, cutUpTo: number) => void;
}) {
  const rows = PLAYABLE_CARD_IDS.filter((id) => (baseCounts[id] ?? 0) > 0).sort(
    (a, b) => CARDS[a].name.localeCompare(CARDS[b].name),
  );

  if (rows.length === 0) {
    return (
      <div className="ratio-cut-panel">
        <SectionHeading title="CUT BUDGETS" meta={<strong>0 cards</strong>} />
        <p className="ratio-refine-hint">Select a saved deck to flag cuts.</p>
      </div>
    );
  }

  return (
    <div className="ratio-cut-panel">
      <SectionHeading
        title="CUT BUDGETS"
        meta={
          <strong>
            {rows.filter((id) => (cutBudgets[id] ?? 0) > 0).length} flexible
          </strong>
        }
      />
      <p className="ratio-refine-hint">
        Raise “cut up to” on cards you are willing to trim. Freed slots are
        filled from the replacement pool below.
      </p>
      <div className="ratio-cut-table">
        <div className="ratio-cut-head">
          <span>Card</span>
          <span>In list</span>
          <span>Cut up to</span>
        </div>
        {rows.map((id) => {
          const count = baseCounts[id] ?? 0;
          const cut = Math.min(count, Math.max(0, cutBudgets[id] ?? 0));
          return (
            <div className="ratio-cut-row" key={id}>
              <span>
                <b>{CARDS[id].name}</b>
                <small>{CARDS[id].kind}</small>
              </span>
              <span className="ratio-cut-count">{count}×</span>
              <input
                aria-label={`${CARDS[id].name} cut up to`}
                type="number"
                min={0}
                max={count}
                value={cut}
                onChange={(event) =>
                  onCutBudgetChange(id, Number(event.target.value))
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReplacementPoolPanel({
  baseCounts,
  replacements,
  onToggle,
  onMaxChange,
}: {
  baseCounts: DeckCounts;
  replacements: Partial<Record<CardId, number>>;
  onToggle: (id: CardId) => void;
  onMaxChange: (id: CardId, max: number) => void;
}) {
  const sorted = PLAYABLE_CARD_IDS.filter(
    (id) => (baseCounts[id] ?? 0) < REFINE_COPY_CEILING,
  ).sort((a, b) => CARDS[a].name.localeCompare(CARDS[b].name));
  const allowedCount = Object.keys(replacements).filter(
    (id) => (baseCounts[id as CardId] ?? 0) < REFINE_COPY_CEILING,
  ).length;

  return (
    <div className="ratio-replace-panel">
      <SectionHeading
        title="REPLACEMENT POOL"
        meta={<strong>{allowedCount} allowed</strong>}
      />
      <p className="ratio-refine-hint">
        Any freed cut slots can be filled by these cards. Cards already at 4
        copies are hidden. Set a max copies per card (default 4).
      </p>
      <div className="ratio-replace-grid" role="group" aria-label="Replacement cards">
        {sorted.map((id) => {
          const max = replacements[id];
          const checked = max != null;
          return (
            <div
              key={id}
              className={
                checked
                  ? "ratio-replace-chip is-selected"
                  : "ratio-replace-chip"
              }
            >
              <label className="ratio-replace-toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(id)}
                />
                <span>
                  <b>{CARDS[id].name}</b>
                  <small>{CARDS[id].kind}</small>
                </span>
              </label>
              {checked && (
                <label className="ratio-replace-max">
                  Max
                  <input
                    aria-label={`${CARDS[id].name} max copies`}
                    type="number"
                    min={1}
                    max={4}
                    value={max}
                    onChange={(event) =>
                      onMaxChange(id, Number(event.target.value))
                    }
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
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
  busy,
  progress,
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
  busy?: boolean;
  progress?: OptimizeProgress | null;
  onDeckAttemptsChange: (value: number) => void;
}) {
  const livePercent = progressPercent(progress);

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
            ? "Deck size is outside the bound totals — open cuts and replacements"
            : freeCopies === 0
              ? "No cut slots open — raise cut budgets and pick replacements"
              : legalDecklists === BigInt(1)
                ? "Only one mix fits — cut more copies or widen the replacement pool"
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
      {busy && progress && (
        <OptimizeProgressPanel progress={progress} percent={livePercent} />
      )}
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
          disabled={attemptCeiling < 1 || Boolean(busy)}
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
  onRatioSamplesChange,
  onMetricChange,
}: {
  deckSize: number;
  ratioSamples: number;
  metric: "mean" | "p50";
  onRatioSamplesChange: (value: number) => void;
  onMetricChange: (value: "mean" | "p50") => void;
}) {
  return (
    <div className="ratio-controls">
      <label>
        Deck size
        <input type="number" value={deckSize} readOnly disabled />
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
  criteria,
  onSaveDecklist,
}: {
  result: RatioResult | null;
  criteria: RatioRefineCriteria | null;
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
    <section className="ratio-results" aria-live="polite">
      {criteria && (
        <div className="ratio-criteria">
          <SectionHeading
            title="TEST CRITERIA"
            meta={
              <strong>
                {cutRows.length} cut · {addRows.length} add
              </strong>
            }
          />
          <div className="ratio-criteria-cols">
            <div>
              <p className="ratio-criteria-label">Could be lowered</p>
              {cutRows.length === 0 ? (
                <p className="ratio-criteria-empty">No cut budgets set.</p>
              ) : (
                <ul>
                  {cutRows.map((row) => (
                    <li key={`cut-${row.id}`}>
                      <b>−{row.cutUpTo}×</b>
                      <span>
                        {CARDS[row.id].name}
                        <small>
                          from {row.inList}× · floor {row.inList - row.cutUpTo}×
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="ratio-criteria-label">Could be added</p>
              {addRows.length === 0 ? (
                <p className="ratio-criteria-empty">No replacement cards.</p>
              ) : (
                <ul>
                  {addRows.map((row) => (
                    <li key={`add-${row.id}`}>
                      <b>≤{row.max}×</b>
                      <span>
                        {CARDS[row.id].name}
                        <small>
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

      <div className="ratio-results-body">
        <div className="ratio-results-lead">
          <span>BEST SCORE</span>
          <strong>{result.bestScore.toFixed(2)}</strong>
          <small>Top {top.length} distinct lists</small>
        </div>
        <ol className="ratio-rankings">
          {top.map((entry) => {
            const changes = criteria
              ? deckDiffEntries(criteria.baseCounts, entry.counts)
              : [];
            return (
              <li key={`rank-${entry.rank}-${entry.score}`}>
                <header>
                  <span>#{entry.rank}</span>
                  <strong>{entry.score.toFixed(2)}</strong>
                </header>
                {criteria && (
                  <div className="ratio-changes">
                    <p className="ratio-changes-label">
                      {changes.length === 0
                        ? "No count changes vs base"
                        : `${changes.length} change${changes.length === 1 ? "" : "s"} vs base`}
                    </p>
                    {changes.length > 0 && (
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
                    )}
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
            );
          })}
        </ol>
      </div>
    </section>
  );
}
