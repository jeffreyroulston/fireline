import type { ReactNode } from "react";
import { InfoPopover } from "@/components/info-popover";
import { cn } from "@/lib/utils/cn";
import type { StatLineItem, StatTone } from "./stat-line";
import { StatLine } from "./stat-line";

export type DistributionStatKey =
  | "mean"
  | "p10"
  | "p50"
  | "p90"
  | "range"
  | "influence";

export const DISTRIBUTION_STATS: Record<
  DistributionStatKey,
  { label: string; tone: StatTone; hint: string }
> = {
  mean: {
    label: "Average Damage",
    tone: "mean",
    hint: "Average damage across all samples in this pool.",
  },
  p10: {
    label: "P10",
    tone: "p10",
    hint: "10th percentile. About 1 in 10 samples deal this damage or less.",
  },
  p50: {
    label: "P50",
    tone: "p50",
    hint: "Median damage. Half the samples deal this or less.",
  },
  p90: {
    label: "P90",
    tone: "p90",
    hint: "90th percentile. About 9 in 10 samples deal this damage or less.",
  },
  range: {
    label: "RANGE",
    tone: "range",
    hint: "Lowest and highest damage among samples.",
  },
  influence: {
    label: "END INF",
    tone: "influence",
    hint: "Average influence left on the board at the end of the line.",
  },
};

const summaryRowClass =
  "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-6 border-b border-border";

const averageBlockClass =
  "grid justify-items-end gap-1 py-[18px] text-right [&_small]:font-mono [&_small]:text-[9px] [&_small]:text-muted";

const averageValueClass =
  "font-display text-[clamp(40px,5vw,56px)] font-semibold leading-[0.9] text-foreground not-italic";

export function DistributionStatLabel({
  stat,
}: {
  stat: DistributionStatKey;
}) {
  const { label, hint } = DISTRIBUTION_STATS[stat];
  return <InfoPopover label={label}>{hint}</InfoPopover>;
}

export function distributionStatItem(
  stat: DistributionStatKey,
  value: ReactNode,
  after?: ReactNode,
): StatLineItem {
  const { label, tone, hint } = DISTRIBUTION_STATS[stat];
  return {
    label,
    value,
    after,
    tone,
    hint,
  };
}

export function AverageDamageStat({
  value,
  after,
  className,
}: {
  value: ReactNode;
  after?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(averageBlockClass, className)}>
      <small>
        <DistributionStatLabel stat="mean" />
      </small>
      <div className={averageValueClass}>{value}</div>
      {after}
    </div>
  );
}

export function DistributionSummary({
  items,
  average,
  className,
}: {
  items: StatLineItem[];
  average: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(summaryRowClass, className)}>
      <StatLine items={items} className="min-w-0 border-b-0" />
      {average}
    </div>
  );
}
