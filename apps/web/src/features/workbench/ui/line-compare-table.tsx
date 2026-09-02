"use client";

import type { LineEvent } from "@/lib/engine";
import { CARD_LIST } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
import { expandEventZones } from "../lib/expand-zones";
import { formatLineEvent } from "../lib/format-line-event";
import { alignLineEvents } from "../lib/two-pass-event-diff";
import type { StepAlignment } from "../types";

type CompareTableRow = Readonly<{
  step: number;
  left: LineEvent | null;
  right: LineEvent | null;
  differs: boolean;
}>;

function rowsFromAlignment(
  leftEvents: LineEvent[],
  rightEvents: LineEvent[],
  alignment: StepAlignment[],
): CompareTableRow[] {
  return alignment.map((entry, index) => {
    switch (entry.kind) {
      case "match":
        return {
          step: index + 1,
          left: leftEvents[entry.brick],
          right: rightEvents[entry.oracle],
          differs: false,
        };
      case "brick-only":
        return {
          step: index + 1,
          left: leftEvents[entry.brick],
          right: null,
          differs: true,
        };
      case "oracle-only":
        return {
          step: index + 1,
          left: null,
          right: rightEvents[entry.oracle],
          differs: true,
        };
    }
  });
}

function actionLabel(event: LineEvent | null): string {
  if (!event) {
    return "—";
  }
  return formatLineEvent(event, CARD_LIST);
}

function influenceRemaining(events: LineEvent[]): string[] {
  const last = expandEventZones(events).at(-1);
  if (!last) {
    return [];
  }
  return [...(last.hand ?? []), ...(last.memory ?? [])];
}

function cardNames(ids: string[]): string {
  if (ids.length === 0) {
    return "—";
  }
  return ids
    .map((id) => CARD_LIST.find((card) => card.id === id)?.name ?? id)
    .join(", ");
}

function sameCardMultiset(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

export function LineCompareTable({
  leftEvents,
  rightEvents,
  leftLabel,
  leftDamage,
  rightLabel,
  rightDamage,
}: {
  leftEvents: LineEvent[];
  rightEvents: LineEvent[];
  leftLabel: string;
  leftDamage: number;
  rightLabel: string;
  rightDamage: number;
}) {
  const rows = rowsFromAlignment(
    leftEvents,
    rightEvents,
    alignLineEvents(leftEvents, rightEvents),
  );
  const leftInfluence = influenceRemaining(leftEvents);
  const rightInfluence = influenceRemaining(rightEvents);
  const influenceDiffers = !sameCardMultiset(leftInfluence, rightInfluence);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            <th scope="col" className="w-10 px-3 pt-3 pb-2.5 align-bottom font-mono text-[10px] font-medium tracking-[0.08em] text-muted uppercase">
              #
            </th>
            <th scope="col" className="px-3 pt-3 pb-2.5 text-left align-bottom">
              <strong className="block font-display text-[36px] leading-[0.9] text-primary tabular-nums">
                {leftDamage}
              </strong>
              <span className="mt-1.5 block font-mono text-[10px] font-medium tracking-[0.08em] text-muted uppercase">
                {leftLabel}
              </span>
            </th>
            <th scope="col" className="px-3 pt-3 pb-2.5 text-right align-bottom">
              <strong className="block font-display text-[36px] leading-[0.9] text-secondary tabular-nums">
                {rightDamage}
              </strong>
              <span className="mt-1.5 block font-mono text-[10px] font-medium tracking-[0.08em] text-muted uppercase">
                {rightLabel}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.step}
              className={cn(
                "border-b border-[color-mix(in_srgb,var(--color-border)_60%,transparent)] last:border-b-0",
                row.differs &&
                  "bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]",
              )}
            >
              <td className="px-3 py-2.5 align-top font-mono text-[11px] text-muted">
                {row.step}
              </td>
              <td
                className={cn(
                  "px-3 py-2.5 align-top leading-[1.45]",
                  row.left == null && "text-muted",
                  row.differs && row.left != null && "text-primary",
                )}
              >
                {actionLabel(row.left)}
              </td>
              <td
                className={cn(
                  "px-3 py-2.5 align-top leading-[1.45]",
                  row.right == null && "text-muted",
                  row.differs && row.right != null && "text-secondary",
                )}
              >
                {actionLabel(row.right)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr
            className={cn(
              "border-t border-border bg-surface-muted",
              influenceDiffers &&
                "bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface-muted))]",
            )}
          >
            <th
              scope="row"
              className="px-3 py-2.5 align-top font-mono text-[10px] font-medium tracking-[0.08em] text-muted uppercase"
            >
              Inf
            </th>
            <td
              className={cn(
                "px-3 py-2.5 align-top leading-[1.45]",
                leftInfluence.length === 0 && "text-muted",
                influenceDiffers && leftInfluence.length > 0 && "text-primary",
              )}
            >
              {cardNames(leftInfluence)}
            </td>
            <td
              className={cn(
                "px-3 py-2.5 text-right align-top leading-[1.45]",
                rightInfluence.length === 0 && "text-muted",
                influenceDiffers && rightInfluence.length > 0 && "text-secondary",
              )}
            >
              {cardNames(rightInfluence)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
