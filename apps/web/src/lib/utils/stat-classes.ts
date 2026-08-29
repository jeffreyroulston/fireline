import type { StatTone } from "@/features/workbench/ui/stat-line";
import { cn } from "@/lib/utils/cn";

const STAT_TONE_SPAN: Record<StatTone, string> = {
  mean: "border-l-[color-mix(in_srgb,var(--color-foreground)_28%,var(--color-border))]",
  p10: "border-l-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-border))] [&_small]:text-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-muted))] [&_b]:text-[color-mix(in_srgb,var(--color-accent)_72%,var(--color-foreground))]",
  p50: "border-l-[color-mix(in_srgb,var(--color-foreground)_28%,var(--color-border))]",
  p90: "border-l-[color-mix(in_srgb,var(--color-primary)_55%,var(--color-border))] [&_small]:text-[color-mix(in_srgb,var(--color-primary-dark)_50%,var(--color-muted))] [&_b]:text-primary-dark",
  range:
    "border-l-[color-mix(in_srgb,var(--color-muted)_45%,var(--color-border))] [&_b]:text-[color-mix(in_srgb,var(--color-foreground)_62%,var(--color-muted))]",
  influence:
    "border-l-[color-mix(in_srgb,var(--color-secondary)_55%,var(--color-border))] [&_small]:text-[color-mix(in_srgb,var(--color-secondary-dark)_50%,var(--color-muted))] [&_b]:text-secondary-dark",
  brick:
    "border-l-[color-mix(in_srgb,var(--color-primary)_55%,var(--color-border))] [&_small]:text-[color-mix(in_srgb,var(--color-primary-dark)_50%,var(--color-muted))] [&_b]:text-primary-dark",
  oracle:
    "border-l-[color-mix(in_srgb,var(--color-secondary)_55%,var(--color-border))] [&_small]:text-[color-mix(in_srgb,var(--color-secondary-dark)_50%,var(--color-muted))] [&_b]:text-secondary-dark",
  gap: "border-l-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-secondary))] [&_small]:text-[color-mix(in_srgb,var(--color-secondary-dark)_40%,var(--color-muted))] [&_b]:text-[color-mix(in_srgb,var(--color-primary-dark)_45%,var(--color-secondary-dark))]",
};

export function statSpanClass(tone?: StatTone, index?: number) {
  return cn(
    "grid gap-1 py-[18px]",
    index !== undefined &&
      index > 0 &&
      "border-l-2 border-border pl-3.5",
    tone && STAT_TONE_SPAN[tone],
  );
}

export const statLineClass =
  "grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-x-3 border-b border-border [&_small]:font-mono [&_small]:text-[9px] [&_small]:text-muted [&_b]:font-display [&_b]:text-[28px]";

export const statLineCompactClass = "mt-2 [&_b]:text-[22px]";
