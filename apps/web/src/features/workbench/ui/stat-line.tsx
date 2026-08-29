import type { ReactNode } from "react";
import { InfoPopover } from "@/components/info-popover";
import { cn } from "@/lib/utils/cn";
import {
  statLineClass,
  statLineCompactClass,
  statSpanClass,
} from "@/lib/utils/stat-classes";

export type StatTone =
  | "mean"
  | "p10"
  | "p50"
  | "p90"
  | "range"
  | "influence"
  | "brick"
  | "oracle"
  | "gap";

export type StatLineItem = {
  label: ReactNode;
  value: ReactNode;
  after?: ReactNode;
  tone?: StatTone;
  hint?: ReactNode;
};

const LABEL_TONES: Record<string, StatTone> = {
  "Average Damage": "mean",
  "AVG DAMAGE": "mean",
  MEAN: "mean",
  P10: "p10",
  P50: "p50",
  P90: "p90",
  RANGE: "range",
  "END INF": "influence",
  "BRICK RANGE": "brick",
  "ORACLE RANGE": "oracle",
  "GAP MEAN": "gap",
};

function toneFor(item: StatLineItem): StatTone | undefined {
  if (item.tone) {
    return item.tone;
  }
  return typeof item.label === "string" ? LABEL_TONES[item.label] : undefined;
}

function StatLabel({ item }: { item: StatLineItem }) {
  if (item.hint != null && typeof item.label === "string") {
    return <InfoPopover label={item.label}>{item.hint}</InfoPopover>;
  }
  return item.label;
}

export function StatLine({
  items,
  className,
}: {
  items: StatLineItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        statLineClass,
        className === "compact" && statLineCompactClass,
        className !== "compact" && className,
      )}
    >
      {items.map((item, index) => {
        const tone = toneFor(item);
        return (
          <span key={index} className={statSpanClass(tone, index)}>
            <small>
              <StatLabel item={item} />
            </small>
            <b>{item.value}</b>
            {item.after}
          </span>
        );
      })}
    </div>
  );
}
