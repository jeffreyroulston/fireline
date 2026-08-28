"use client";

import { useEffect, useState } from "react";
import type { LineEvent } from "@/lib/engine";
import { CARD_LIST } from "@/lib/engine";
import { eventMatchesQuery } from "../lib/event-matches-query";
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
}: {
  events: LineEvent[];
  resetKey: unknown;
  stepDiff?: StepDiffInfo[];
  diffPerspective?: "oracle" | "brick";
  query?: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const searching = query.trim().length > 0;
  const expandedEvents = expandEventZones(events);
  const catalog = CARD_LIST;

  useEffect(() => {
    setExpanded(null);
  }, [resetKey]);

  return (
    <ol className={searching ? "is-searching" : undefined}>
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
        const matches =
          searching && eventMatchesQuery(event, query, catalog);
        const className =
          [
            open ? "is-expanded" : undefined,
            isOracleDiff ? "is-diff-added" : undefined,
            matches ? "is-search-match" : undefined,
          ]
            .filter(Boolean)
            .join(" ") || undefined;

        return (
          <li key={`${title}-${index}`} className={className}>
            <button
              type="button"
              className="tape-row"
              aria-expanded={open}
              onClick={() =>
                setExpanded((current) => (current === index ? null : index))
              }
            >
              <span>{String(index).padStart(2, "0")}</span>
              <code>{row}</code>
            </button>
            {open && (
              <div className="tape-expand">
                {isOracleDiff && diff?.compareEvent && (
                  <p className="tape-diff-compare">
                    <span>Fire brick</span>
                    {formatLineEvent(diff.compareEvent, catalog)}
                  </p>
                )}
                <p className="tape-expand-action">{title}</p>
                <dl className="tape-expand-stats">
                  <div>
                    <dt>Turn</dt>
                    <dd>{event.turn}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{PHASE_LABELS[event.phase] ?? event.phase}</dd>
                  </div>
                  <div>
                    <dt>Damage</dt>
                    <dd>
                      {event.damage}
                      {damageDelta > 0 && (
                        <span className="tape-damage-delta">+{damageDelta}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Allies</dt>
                    <dd>{allyNames.length}</dd>
                  </div>
                  <div>
                    <dt>Fire GY</dt>
                    <dd>{event.fireGy}</dd>
                  </div>
                </dl>
                <div className="tape-expand-zones">
                  <div>
                    <span>Allies · {allyNames.length}</span>
                    {allyNames.length > 0 && (
                      <ul>
                        {allyNames.map((card, cardIndex) => (
                          <li key={`ally-${card}-${cardIndex}`}>{card}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <span>Memory · {memoryCards.length}</span>
                    {memoryCards.length > 0 && (
                      <ul>
                        {memoryCards.map((card, cardIndex) => (
                          <li key={`mem-${card}-${cardIndex}`}>{card}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <span>Hand · {handCards.length}</span>
                    {handCards.length > 0 && (
                      <ul>
                        {handCards.map((card, cardIndex) => (
                          <li key={`hand-${card}-${cardIndex}`}>{card}</li>
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
