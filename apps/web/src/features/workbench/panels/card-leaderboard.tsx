"use client";

import { useState } from "react";
import type { SparseLineStats } from "@ga-fire/contracts";
import {
  cardDisplayName,
  isMaterialId,
  type CardStat,
} from "@/lib/engine";
import type { CardLeaderboardResponse } from "@/lib/api/client";
import { InfoPopover } from "@/components/info-popover";
import { cn, pillTabListClass, pillTabVariants } from "@/lib/utils";
import { SectionHeading } from "../ui";
import type { SampleHand } from "../types";
import {
  computeHandLiftByCard,
  formatLift,
} from "../lib/hand-lift";
import { partnerDeltaClass } from "./card-database/shared";
import {
  historyPanelClass,
  historyTableWrapClass,
} from "./history/shared";

const historyCopyColClass = "w-11 text-center font-mono text-xs text-muted";

const leaderboardPassTabsClass = cn(pillTabListClass, "mb-3");

function leaderboardPassTabClass(tabId: LeaderboardPass, active: boolean) {
  return cn(
    pillTabVariants({ active }),
    active && tabId === "brick" && "text-primary-dark",
    active && tabId === "oracle" && "text-secondary-dark",
  );
}

const historyCardLegendClass =
  "mb-3 flex flex-wrap gap-x-5 gap-y-4 font-mono text-[10px] tracking-[0.06em] text-muted uppercase [&_span]:inline-flex [&_span]:items-center [&_span]:gap-2 [&_.is-in-hand]:before:h-2.5 [&_.is-in-hand]:before:w-2.5 [&_.is-in-hand]:before:bg-gradient-to-b [&_.is-in-hand]:before:from-[#e8dcc8] [&_.is-in-hand]:before:to-[#b8a588] [&_.is-in-hand]:before:content-[''] [&_.is-played]:before:h-2.5 [&_.is-played]:before:w-2.5 [&_.is-played]:before:bg-gradient-to-b [&_.is-played]:before:from-[#8fd8ae] [&_.is-played]:before:to-[#3d9970] [&_.is-played]:before:content-['']";

const historyLeaderboardTableWrapClass = cn(
  historyTableWrapClass,
  "overflow-visible",
);

const historyLeaderboardPanelClass = cn(
  historyPanelClass,
  "mt-[18px] pb-2",
);

const historyLeaderboardSelectableClass =
  "[&_tbody_tr:not(.leaderboard-section-row)]:cursor-pointer [&_tbody_tr.is-selected_td]:bg-[color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface-muted))]";

const leaderboardSectionRowClass =
  "[&_th]:bg-[color-mix(in_srgb,var(--color-surface-muted)_70%,transparent)] [&_th]:pt-4 [&_th]:font-display [&_th]:text-[13px] [&_th]:tracking-[0.08em] [&_th]:text-muted [&_th]:uppercase hover:[&_th]:bg-[color-mix(in_srgb,var(--color-surface-muted)_70%,transparent)]";

const collapsibleInnerClass = "mx-4 mb-3";

const collapsibleLeaderboardClass = cn(
  "mt-[22px] border border-border bg-surface pb-2",
  "[&>summary]:flex [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-baseline [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:px-4 [&>summary]:py-3.5",
  "[&>summary::-webkit-details-marker]:hidden",
  "[&>summary_span]:font-mono [&>summary_span]:text-[11px] [&>summary_span]:tracking-[0.08em] [&>summary_span]:text-foreground [&>summary_span]:uppercase",
  "[&>summary_small]:font-mono [&>summary_small]:text-[10px] [&>summary_small]:text-muted",
  "[&>summary::after]:font-mono [&>summary::after]:text-muted [&>summary::after]:content-['+']",
  "[&[open]>summary::after]:content-['−']",
);

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
  const material = isMaterialId(cardId);
  const map: Record<string, BarCardHighlight> = {};
  for (const sample of highlights) {
    if (!material && !sample.inHand.includes(cardId)) {
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

export const LIVE_RUN_ID = "live";

/** Build History-style highlight records from live evaluate sample hands. */
export function highlightsFromHands(
  hands: Array<{ hand: string[]; lineCardStats?: SparseLineStats | null }>,
  runId = LIVE_RUN_ID,
): Array<{
  runId: string;
  sampleIndex: number;
  inHand: string[];
  played: string[];
}> {
  return hands.map((sample, sampleIndex) => {
    const plays = sample.lineCardStats?.plays ?? {};
    const attacks = sample.lineCardStats?.attacks ?? {};
    const openingCopies = new Map<string, number>();
    for (const cardId of sample.hand) {
      openingCopies.set(cardId, (openingCopies.get(cardId) ?? 0) + 1);
    }
    const played: string[] = [];
    for (const [cardId, copies] of openingCopies) {
      if ((plays[cardId] ?? 0) >= copies) {
        played.push(cardId);
      }
    }
    for (const cardId of new Set([
      ...Object.keys(plays),
      ...Object.keys(attacks),
    ])) {
      if (!isMaterialId(cardId) || played.includes(cardId)) {
        continue;
      }
      if ((plays[cardId] ?? 0) > 0 || (attacks[cardId] ?? 0) > 0) {
        played.push(cardId);
      }
    }
    return {
      runId,
      sampleIndex,
      inHand: sample.hand,
      played,
    };
  });
}

export function leaderboardFromCardStats(
  stats: CardStat[],
  samples: number,
  options?: {
    hands?: SampleHand[];
    pass?: LeaderboardPass;
  },
): CardLeaderboardResponse {
  const pass =
    options?.pass === "combined" ? undefined : options?.pass;
  const lifts =
    options?.hands && options.hands.length > 0
      ? computeHandLiftByCard(
          options.hands,
          stats.map((row) => row.card),
          pass,
        )
      : null;
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
      handLift: lifts?.get(row.card) ?? null,
    })),
  };
}

type LeaderboardRow = CardLeaderboardResponse["cards"][number];

function LiftCell({ value }: { value: number | null }) {
  if (value == null) {
    return "—";
  }
  return (
    <span className={partnerDeltaClass(value)}>
      {formatLift(value)}
    </span>
  );
}

function LeaderboardBody({
  rows,
  selectedCardId,
  selectable,
  onSelectedCardIdChange,
}: {
  rows: LeaderboardRow[];
  selectedCardId: string | null;
  selectable: boolean;
  onSelectedCardIdChange?: (cardId: string | null) => void;
}) {
  return (
    <tbody>
      {rows.map((row) => {
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
                    onSelectedCardIdChange?.(selected ? null : row.cardId)
                : undefined
            }
            onKeyDown={
              selectable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectedCardIdChange?.(selected ? null : row.cardId);
                    }
                  }
                : undefined
            }
          >
            <td className={historyCopyColClass}>{row.deckCopies}</td>
            <td>{cardDisplayName(row.cardId)}</td>
            <td>{formatPct(row.seeRate)}</td>
            <td>{formatPct(row.playWhenInHand)}</td>
            <td>{row.damageWhenSeen.toFixed(1)}</td>
            <td>
              <LiftCell value={row.handLift} />
            </td>
            <td>{formatPct(row.damageShare)}</td>
          </tr>
        );
      })}
    </tbody>
  );
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
  const deckCards = active.cards.filter((row) => !isMaterialId(row.cardId));
  const materialCards = active.cards.filter((row) => isMaterialId(row.cardId));

  const innerMarginClass = collapsible ? collapsibleInnerClass : undefined;

  const tabs = twoPassLeaderboards != null && (
    <div
      className={cn(leaderboardPassTabsClass, innerMarginClass)}
      role="tablist"
      aria-label="Card leaderboard pass"
    >
      {PASS_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={pass === tab.id}
          className={leaderboardPassTabClass(tab.id, pass === tab.id)}
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
        <div className={cn(historyCardLegendClass, innerMarginClass)} aria-label="Bar highlight legend">
          {isMaterialId(selectedCardId) ? (
            <>
              <span className="is-in-hand">On the material deck, unused</span>
              <span className="is-played">Used on the optimal line</span>
            </>
          ) : (
            <>
              <span className="is-in-hand">In opening hand, copies left unplayed</span>
              <span className="is-played">In opening hand, all copies played</span>
            </>
          )}
        </div>
      )}
      <div className={cn(historyLeaderboardTableWrapClass, innerMarginClass)}>
        <table>
          <thead>
            <tr>
              <th className={historyCopyColClass}>
                <InfoPopover label="#">
                  Copies of this card in the evaluated decklist.
                </InfoPopover>
              </th>
              <th>
                <InfoPopover label="Card">
                  {selectable
                    ? "Card name in the evaluated deck. Click a row to highlight opening hands on the damage chart."
                    : "Card name in the evaluated deck or opening hand."}
                </InfoPopover>
              </th>
              <th>
                <InfoPopover label="Seen">
                  Share of samples where this card appeared — opened in the
                  starting hand or drawn on the optimal line.
                </InfoPopover>
              </th>
              <th>
                <InfoPopover label="Play|hand">
                  Share of in-hand copies that were played — plays ÷
                  opening-hand copies plus mid-line draws.
                </InfoPopover>
              </th>
              <th>
                <InfoPopover label="Dmg|seen">
                  Mean attributed damage per sample where the card was seen.
                </InfoPopover>
              </th>
              <th>
                <InfoPopover label="Lift">
                  Mean damage when this card opens in hand minus mean damage
                  from the same deck without it in the opening hand. Needs at
                  least five samples in each bucket.
                </InfoPopover>
              </th>
              <th>
                <InfoPopover label="Share">
                  This card&apos;s share of total attributed damage across the
                  pool.
                </InfoPopover>
              </th>
            </tr>
          </thead>
          <LeaderboardBody
            rows={deckCards}
            selectedCardId={selectedCardId}
            selectable={selectable}
            onSelectedCardIdChange={onSelectedCardIdChange}
          />
          {materialCards.length > 0 && (
            <>
              <tbody>
                <tr className={leaderboardSectionRowClass}>
                  <th colSpan={7} scope="colgroup">
                    Materials
                  </th>
                </tr>
              </tbody>
              <LeaderboardBody
                rows={materialCards}
                selectedCardId={selectedCardId}
                selectable={selectable}
                onSelectedCardIdChange={onSelectedCardIdChange}
              />
            </>
          )}
        </table>
      </div>
    </>
  );

  if (collapsible) {
    return (
      <details
        className={cn(
          collapsibleLeaderboardClass,
          selectable && historyLeaderboardSelectableClass,
        )}
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
      className={cn(
        historyLeaderboardPanelClass,
        selectable && historyLeaderboardSelectableClass,
      )}
    >
      <SectionHeading
        title="CARD LEADERBOARD"
        meta={<strong>{sampleLabel}</strong>}
      />
      {table}
    </section>
  );
}
