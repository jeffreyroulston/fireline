"use client";

import { useState } from "react";
import { CARDS, type CardId, type CardStat } from "@/lib/engine";
import type { CardLeaderboardResponse } from "@/lib/api/client";
import { ColumnHelp, SectionHeading } from "../ui";

function formatPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export type BarCardHighlight = "in_hand" | "played";

export type LeaderboardPass = "combined" | "brick" | "oracle";

export type TwoPassLeaderboards = Record<LeaderboardPass, CardLeaderboardResponse>;

const PASS_TABS: Array<{ id: LeaderboardPass; label: string }> = [
  { id: "combined", label: "Combined" },
  { id: "brick", label: "Fire brick" },
  { id: "oracle", label: "Oracle" },
];

export function buildBarHighlights(
  highlights: Array<{
    runId: string;
    sampleIndex: number;
    inHand: string[];
    played: string[];
  }>,
  cardId: string | null,
): Record<string, BarCardHighlight> {
  if (!cardId) {
    return {};
  }
  const map: Record<string, BarCardHighlight> = {};
  for (const sample of highlights) {
    if (!sample.inHand.includes(cardId)) {
      continue;
    }
    map[`${sample.runId}-${sample.sampleIndex}`] = sample.played.includes(
      cardId,
    )
      ? "played"
      : "in_hand";
  }
  return map;
}

export function leaderboardFromCardStats(
  stats: CardStat[],
  samples: number,
): CardLeaderboardResponse {
  return {
    runCount: 1,
    totalSamples: Math.max(samples, 1),
    cards: stats.map((row) => ({
      cardId: row.card,
      deckCopies: row.copies,
      seeRate: row.seeRate,
      playWhenInHand: row.playWhenInHand,
      damageWhenSeen: row.damageWhenSeen,
      damageShare: row.damageShare,
    })),
  };
}

export function CardLeaderboardPanel({
  leaderboard,
  twoPassLeaderboards,
  selectedCardId = null,
  onSelectedCardIdChange,
  collapsible = false,
}: {
  leaderboard?: CardLeaderboardResponse;
  /** When set, shows Combined / Fire brick / Oracle tabs for two-pass runs. */
  twoPassLeaderboards?: TwoPassLeaderboards;
  selectedCardId?: string | null;
  onSelectedCardIdChange?: (cardId: string | null) => void;
  /** Collapse into a details block for result rails. */
  collapsible?: boolean;
}) {
  const [pass, setPass] = useState<LeaderboardPass>("combined");
  const selectable = typeof onSelectedCardIdChange === "function";
  const active =
    twoPassLeaderboards != null
      ? twoPassLeaderboards[pass]
      : (leaderboard ?? { runCount: 0, totalSamples: 0, cards: [] });
  const sampleLabel =
    active.totalSamples === 1
      ? "1 sample"
      : `${active.totalSamples} samples`;

  const tabs = twoPassLeaderboards != null && (
    <div
      className="leaderboard-pass-tabs"
      role="tablist"
      aria-label="Card leaderboard pass"
    >
      {PASS_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={pass === tab.id}
          className={[
            "leaderboard-pass-tab",
            `is-${tab.id}`,
            pass === tab.id ? "is-active" : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setPass(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const table = (
    <>
      {tabs}
      {selectable && selectedCardId && (
        <div className="history-card-legend" aria-label="Bar highlight legend">
          <span className="is-in-hand">In opening hand, copies left unplayed</span>
          <span className="is-played">In opening hand, all copies played</span>
        </div>
      )}
      <div className="history-table-wrap">
        <table>
          <thead>
            <tr>
              <th className="history-copy-col">
                <ColumnHelp label="#">
                  Copies of this card in the evaluated decklist.
                </ColumnHelp>
              </th>
              <th>
                <ColumnHelp label="Card">
                  {selectable
                    ? "Card name in the evaluated deck. Click a row to highlight opening hands on the damage chart."
                    : "Card name in the evaluated deck or opening hand."}
                </ColumnHelp>
              </th>
              <th>
                <ColumnHelp label="Seen">
                  Share of samples where this card appeared — opened in the
                  starting hand or drawn on the optimal line.
                </ColumnHelp>
              </th>
              <th>
                <ColumnHelp label="Play|hand">
                  Share of in-hand copies that were played — plays ÷
                  opening-hand copies plus mid-line draws.
                </ColumnHelp>
              </th>
              <th>
                <ColumnHelp label="Dmg|seen">
                  Mean attributed damage per sample where the card was seen.
                </ColumnHelp>
              </th>
              <th>
                <ColumnHelp label="Share">
                  This card&apos;s share of total attributed damage across the
                  pool.
                </ColumnHelp>
              </th>
            </tr>
          </thead>
          <tbody>
            {active.cards.map((row) => {
              const selected = selectedCardId === row.cardId;
              return (
                <tr
                  key={row.cardId}
                  className={selected ? "is-selected" : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  aria-pressed={selectable ? selected : undefined}
                  onClick={
                    selectable
                      ? () =>
                          onSelectedCardIdChange(
                            selected ? null : row.cardId,
                          )
                      : undefined
                  }
                  onKeyDown={
                    selectable
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectedCardIdChange(
                              selected ? null : row.cardId,
                            );
                          }
                        }
                      : undefined
                  }
                >
                  <td className="history-copy-col">{row.deckCopies}</td>
                  <td>
                    {CARDS[row.cardId as CardId]?.name ?? row.cardId}
                  </td>
                  <td>{formatPct(row.seeRate)}</td>
                  <td>{formatPct(row.playWhenInHand)}</td>
                  <td>{row.damageWhenSeen.toFixed(1)}</td>
                  <td>{formatPct(row.damageShare)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  if (collapsible) {
    return (
      <details
        className={[
          "card-stats",
          "history-leaderboard",
          selectable ? "is-selectable" : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <summary>
          <span>Card leaderboard</span>
          <small>
            {active.cards.length} cards · {sampleLabel}
          </small>
        </summary>
        {table}
      </details>
    );
  }

  return (
    <section
      className={[
        "history-panel",
        "history-leaderboard",
        selectable ? "is-selectable" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SectionHeading
        title="CARD LEADERBOARD"
        meta={<strong>{sampleLabel}</strong>}
      />
      {table}
    </section>
  );
}
