import type { ReactNode } from "react";

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
};

const LABEL_TONES: Record<string, StatTone> = {
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

export function StatLine({
  items,
  className,
}: {
  items: StatLineItem[];
  className?: string;
}) {
  return (
    <div className={["stat-line", className].filter(Boolean).join(" ")}>
      {items.map((item, index) => {
        const tone = toneFor(item);
        return (
          <span key={index} className={tone ? `is-${tone}` : undefined}>
            <small>{item.label}</small>
            <b>{item.value}</b>
            {item.after}
          </span>
        );
      })}
    </div>
  );
}
