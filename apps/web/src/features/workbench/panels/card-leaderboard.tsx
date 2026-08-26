"use client";

import { CARDS, type CardId } from "@/lib/engine";
import type { CardLeaderboardResponse } from "@/lib/api/client";
import { ColumnHelp } from "../ui";

function formatPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export type BarCardHighlight = "in_hand" | "played";

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

export function CardLeaderboardPanel({
  leaderboard,
  selectedCardId,
  onSelectedCardIdChange,
}: {
  leaderboard: CardLeaderboardResponse;
  selectedCardId: string | null;
  onSelectedCardIdChange: (cardId: string | null) => void;
}) {
  return (
    <section className="history-panel history-leaderboard">
      <div className="section-heading">
        <span>CARD LEADERBOARD</span>
        <strong>{leaderboard.totalSamples} pooled samples</strong>
      </div>
      {selectedCardId && (
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
                  Card name in the evaluated deck. Click a row to highlight
                  opening hands on the damage chart.
                </ColumnHelp>
              </th>
              <th>
                <ColumnHelp label="Seen">
                  Share of pooled samples where this card appeared — opened in
                  the starting hand or drawn on the optimal line.
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
            {leaderboard.cards.map((row) => {
              const selected = selectedCardId === row.cardId;
              return (
                <tr
                  key={row.cardId}
                  className={selected ? "is-selected" : undefined}
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() =>
                    onSelectedCardIdChange(selected ? null : row.cardId)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectedCardIdChange(selected ? null : row.cardId);
                    }
                  }}
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
    </section>
  );
}
