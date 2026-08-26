"use client";

import type { CardStat, SimType } from "@/lib/engine";

export function CardStatsPanel({
  stats,
  samples,
  mode,
}: {
  stats: CardStat[];
  samples: number;
  mode: SimType;
}) {
  const fmtPct = (value: number) => `${(value * 100).toFixed(0)}%`;
  const fmtNum = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <details className="card-stats">
      <summary>
        <span>Deck stats</span>
        <small>
          {stats.length} cards · {samples}{" "}
          {mode === "monte_carlo" && samples > 1 ? "rollouts" : "samples"}
        </small>
      </summary>
      <p className="card-stats-note">
        Rates are normalised by how often each card was opened or drawn on the
        optimal line. Play|hand = share of in-hand copies that were played.
      </p>
      <div className="card-stats-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th title="Copies in deck / hand">N</th>
              <th title="Opened in starting hand">Open</th>
              <th title="Seen (opened or drawn mid-line)">Seen</th>
              <th title="Times played from hand">Play</th>
              <th title="Ally attacks">Atk</th>
              <th title="Damage attributed on the line">Dmg</th>
              <th title="Share of in-hand copies played">Play|hand</th>
              <th title="Mean damage when seen">Dmg|seen</th>
              <th title="Share of attributed damage">Share</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.card}>
                <td>
                  <b>{row.name}</b>
                </td>
                <td>{row.copies}</td>
                <td>{fmtPct(row.openRate)}</td>
                <td>{fmtPct(row.seeRate)}</td>
                <td>{row.plays}</td>
                <td>{row.attacks}</td>
                <td>{row.damage}</td>
                <td>{fmtPct(row.playWhenInHand)}</td>
                <td>{fmtNum(row.damageWhenSeen)}</td>
                <td>{fmtPct(row.damageShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
