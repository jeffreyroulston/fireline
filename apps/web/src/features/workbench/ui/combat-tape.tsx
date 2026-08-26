"use client";

import { useEffect, useState } from "react";
import type { LineStep } from "@/lib/engine";
import { stepMatchesQuery } from "../lib/step-matches-query";
import { PHASE_LABELS, type StepDiffInfo } from "../types";
import { parseZoneCards } from "../lib/parse-zone-cards";

export function CombatTape({
  steps,
  resetKey,
  stepDiff,
  diffPerspective,
  query = "",
}: {
  steps: LineStep[];
  resetKey: unknown;
  stepDiff?: StepDiffInfo[];
  diffPerspective?: "oracle" | "brick";
  query?: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const searching = query.trim().length > 0;

  useEffect(() => {
    setExpanded(null);
  }, [resetKey]);

  return (
    <ol className={searching ? "is-searching" : undefined}>
      {steps.map((step, index) => {
        const open = expanded === index;
        const memoryCards = parseZoneCards(step.memory, "MEM");
        const handCards = parseZoneCards(step.hand, "HAND");
        const damageDelta =
          index > 0 ? step.damage - steps[index - 1].damage : step.damage;
        const diff = stepDiff?.[index];
        const isOracleDiff =
          diffPerspective === "oracle" && diff?.mark === "added";
        const matches = searching && stepMatchesQuery(step, query);
        const className =
          [
            open ? "is-expanded" : undefined,
            isOracleDiff ? "is-diff-added" : undefined,
            matches ? "is-search-match" : undefined,
          ]
            .filter(Boolean)
            .join(" ") || undefined;

        return (
          <li key={`${step.display}-${index}`} className={className}>
            <button
              type="button"
              className="tape-row"
              aria-expanded={open}
              onClick={() =>
                setExpanded((current) => (current === index ? null : index))
              }
            >
              <span>{String(index).padStart(2, "0")}</span>
              <code>{step.display}</code>
            </button>
            {open && (
              <div className="tape-expand">
                {isOracleDiff && diff?.compareAction && (
                  <p className="tape-diff-compare">
                    <span>Fire brick</span>
                    {diff.compareAction}
                  </p>
                )}
                <p className="tape-expand-action">{step.action}</p>
                <dl className="tape-expand-stats">
                  <div>
                    <dt>Turn</dt>
                    <dd>{step.turn}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{PHASE_LABELS[step.phase] ?? step.phase}</dd>
                  </div>
                  <div>
                    <dt>Damage</dt>
                    <dd>
                      {step.damage}
                      {damageDelta > 0 && (
                        <span className="tape-damage-delta">+{damageDelta}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Allies</dt>
                    <dd>{step.allies}</dd>
                  </div>
                  <div>
                    <dt>Fire GY</dt>
                    <dd>{step.fireGy}</dd>
                  </div>
                </dl>
                <div className="tape-expand-zones">
                  <div>
                    <span>Allies · {step.allyNames?.length ?? 0}</span>
                    {(step.allyNames?.length ?? 0) > 0 && (
                      <ul>
                        {step.allyNames.map((card, cardIndex) => (
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
