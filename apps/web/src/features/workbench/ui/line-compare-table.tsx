"use client";

import type { LineEvent } from "@/lib/engine";
import { CARD_LIST } from "@/lib/engine";
import { cn } from "@/lib/utils/cn";
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

export function LineCompareTable({
  leftEvents,
  rightEvents,
  leftLabel,
  rightLabel,
}: {
  leftEvents: LineEvent[];
  rightEvents: LineEvent[];
  leftLabel: string;
  rightLabel: string;
}) {
  const rows = rowsFromAlignment(
    leftEvents,
    rightEvents,
    alignLineEvents(leftEvents, rightEvents),
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-muted font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
            <th scope="col" className="w-10 px-3 py-2.5 font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              {leftLabel}
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">
              {rightLabel}
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
      </table>
    </div>
  );
}
