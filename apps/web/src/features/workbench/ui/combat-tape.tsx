"use client";

import { useEffect, useState } from "react";
import type { LineEvent } from "@/lib/engine";
import { CARD_LIST } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
import {
  eventMatchesCard,
  eventMatchesQuery,
} from "../lib/event-matches-query";
import { expandEventZones } from "../lib/expand-zones";
import { formatLineEvent, formatLineEventRow } from "../lib/format-line-event";
import { PHASE_LABELS, type StepDiffInfo } from "../types";

function zoneNames(ids: string[] | null | undefined): string[] {
  if (!ids?.length) return [];
  return ids.map(
    (id) => CARD_LIST.find((card) => card.id === id)?.name ?? id,
  );
}

export function CombatTape({
  events,
  resetKey,
  stepDiff,
  diffPerspective,
  query = "",
  highlightCardId = null,
}: {
  events: LineEvent[];
  resetKey: unknown;
  stepDiff?: StepDiffInfo[];
  diffPerspective?: "oracle" | "brick";
  query?: string;
  highlightCardId?: string | null;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const searching = query.trim().length > 0;
  const highlightingCard = Boolean(highlightCardId);
  const expandedEvents = expandEventZones(events);
  const catalog = CARD_LIST;

  useEffect(() => {
    setExpanded(null);
  }, [resetKey]);

  return (
    <ol
      className={cn(
        "m-0 list-none overflow-x-auto p-0",
        (searching || highlightingCard) && "is-searching",
      )}
    >
      {expandedEvents.map((event, index) => {
        const open = expanded === index;
        const title = formatLineEvent(event, catalog);
        const row = formatLineEventRow(event, catalog);
        const allyNames = zoneNames(event.allies);
        const memoryCards = zoneNames(event.memory);
        const handCards = zoneNames(event.hand);
        const damageDelta =
          index > 0
            ? event.damage - expandedEvents[index - 1].damage
            : event.damage;
        const diff = stepDiff?.[index];
        const isOracleDiff =
          diffPerspective === "oracle" && diff?.mark === "added";
        const isBrickDiff =
          diffPerspective === "brick" && diff?.mark === "removed";
        const matches =
          searching && eventMatchesQuery(event, query, catalog);
        const cardMatch =
          !matches &&
          highlightingCard &&
          highlightCardId != null &&
          eventMatchesCard(event, highlightCardId, catalog);

        return (
          <li
            key={`${title}-${index}`}
            className={cn(
              "border-b border-[color-mix(in_srgb,var(--color-border)_60%,transparent)] last:border-b-0",
              isOracleDiff && "[&_.tape-row]:border-l-[3px] [&_.tape-row]:border-secondary [&_.tape-row]:pl-2",
              isBrickDiff && "[&_.tape-row]:border-l-[3px] [&_.tape-row]:border-primary [&_.tape-row]:pl-2",
              matches &&
                "[&_.tape-row]:bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] [&_.tape-row]:shadow-[inset_3px_0_0_var(--color-accent)]",
              matches &&
                open &&
                "[&_.tape-row]:bg-[color-mix(in_srgb,var(--color-accent)_22%,var(--color-surface-muted))]",
              cardMatch &&
                "[&_.tape-row]:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] [&_.tape-row]:shadow-[inset_3px_0_0_var(--color-primary)]",
              cardMatch &&
                open &&
                "[&_.tape-row]:bg-[color-mix(in_srgb,var(--color-primary)_20%,var(--color-surface-muted))]",
              open && "[&_.tape-row]:bg-surface-muted",
            )}
          >
            <button
              type="button"
              className="tape-row grid w-full min-w-min cursor-pointer grid-cols-[30px_max-content] gap-2.5 border-0 bg-transparent py-2.5 text-left transition-[background] duration-150 ease-in-out hover:bg-[color-mix(in_srgb,var(--color-surface-muted)_85%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--color-surface-muted)_85%,transparent)]"
              aria-expanded={open}
              onClick={() =>
                setExpanded((current) => (current === index ? null : index))
              }
            >
              <span className="font-mono text-[9px] text-primary">
                {String(index).padStart(2, "0")}
              </span>
              <code className="font-mono text-[11px] leading-[1.55] whitespace-pre">
                {row}
              </code>
            </button>
            {open && (
              <div className="mb-3 animate-[tape-expand-in_220ms_cubic-bezier(0.2,0.8,0.2,1)_both] border border-border bg-surface-muted px-[18px] pt-4 pb-[18px]">
                {isOracleDiff && diff?.compareEvent && (
                  <p className="mb-3 grid gap-1 border-l-2 border-secondary py-0 pl-2.5 font-mono text-[11px] leading-[1.45]">
                    <span className="text-[9px] tracking-[0.08em] text-secondary-dark uppercase">
                      Fire brick
                    </span>
                    {formatLineEvent(diff.compareEvent, catalog)}
                  </p>
                )}
                {isBrickDiff && diff?.compareEvent && (
                  <p className="mb-3 grid gap-1 border-l-2 border-primary py-0 pl-2.5 font-mono text-[11px] leading-[1.45]">
                    <span className="text-[9px] tracking-[0.08em] text-primary uppercase">
                      Optimal
                    </span>
                    {formatLineEvent(diff.compareEvent, catalog)}
                  </p>
                )}
                <p className="mb-3 font-display text-[22px] leading-[1.1] tracking-[0.02em] uppercase">
                  {title}
                </p>
                <dl className="mb-3.5 grid grid-cols-5 gap-2">
                  <div className="grid min-w-0 gap-1">
                    <dt className="font-mono text-[9px] text-muted uppercase">
                      Turn
                    </dt>
                    <dd className="m-0 flex items-baseline gap-1.5 font-display text-[22px] leading-none">
                      {event.turn}
                    </dd>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <dt className="font-mono text-[9px] text-muted uppercase">
                      Phase
                    </dt>
                    <dd className="m-0 flex items-baseline gap-1.5 font-display text-[22px] leading-none">
                      {PHASE_LABELS[event.phase] ?? event.phase}
                    </dd>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <dt className="font-mono text-[9px] text-muted uppercase">
                      Damage
                    </dt>
                    <dd className="m-0 flex items-baseline gap-1.5 font-display text-[22px] leading-none">
                      {event.damage}
                      {damageDelta > 0 && (
                        <span className="font-mono text-xs font-medium tracking-[0.02em] text-primary">
                          +{damageDelta}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <dt className="font-mono text-[9px] text-muted uppercase">
                      Allies
                    </dt>
                    <dd className="m-0 flex items-baseline gap-1.5 font-display text-[22px] leading-none">
                      {allyNames.length}
                    </dd>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <dt className="font-mono text-[9px] text-muted uppercase">
                      Fire GY
                    </dt>
                    <dd className="m-0 flex items-baseline gap-1.5 font-display text-[22px] leading-none">
                      {event.fireGy}
                    </dd>
                  </div>
                </dl>
                <div className="grid grid-cols-3">
                  <div className="grid min-w-0 gap-2 pr-3.5">
                    <span className="font-mono text-[9px] text-muted uppercase">
                      Allies · {allyNames.length}
                    </span>
                    {allyNames.length > 0 && (
                      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {allyNames.map((card, cardIndex) => (
                          <li
                            key={`ally-${card}-${cardIndex}`}
                            className="border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-surface px-2 py-1 font-mono text-[11px]"
                          >
                            {card}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="grid min-w-0 gap-2 border-l border-[color-mix(in_srgb,var(--color-border)_80%,transparent)] px-3.5">
                    <span className="font-mono text-[9px] text-muted uppercase">
                      Memory · {memoryCards.length}
                    </span>
                    {memoryCards.length > 0 && (
                      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {memoryCards.map((card, cardIndex) => (
                          <li
                            key={`mem-${card}-${cardIndex}`}
                            className="border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-surface px-2 py-1 font-mono text-[11px]"
                          >
                            {card}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="grid min-w-0 gap-2 border-l border-[color-mix(in_srgb,var(--color-border)_80%,transparent)] pl-3.5">
                    <span className="font-mono text-[9px] text-muted uppercase">
                      Hand · {handCards.length}
                    </span>
                    {handCards.length > 0 && (
                      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {handCards.map((card, cardIndex) => (
                          <li
                            key={`hand-${card}-${cardIndex}`}
                            className="border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] bg-surface px-2 py-1 font-mono text-[11px]"
                          >
                            {card}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
