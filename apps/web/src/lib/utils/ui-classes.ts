import { cn } from "@/lib/utils/cn";

export const settingsRowClass =
  "flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch";

export const secondaryActionClass =
  "h-[42px] border border-foreground bg-transparent px-4 font-mono text-[11px] uppercase max-[620px]:w-full";

export const textActionClass =
  "border-0 bg-transparent px-1 py-2.5 font-mono text-[11px] text-muted underline underline-offset-4 uppercase";

export const textActionDangerClass = cn(textActionClass, "text-primary-dark");

export const simHintClass = "m-2 mt-2 text-xs leading-snug text-muted";

export const errorBannerClass =
  "border border-primary-dark/45 border-l-4 border-l-primary bg-[color-mix(in_srgb,var(--color-primary)_12%,white)] px-3.5 py-3 text-[13px] leading-snug text-primary-dark";

export const sectionHeadingWithHelpClass = "inline-flex items-center gap-1.5";

export function deltaTextClass(value: number): string {
  if (value > 0) return "text-primary-dark";
  if (value < 0) return "text-secondary-dark";
  return "";
}

export const partnerDeltaClass =
  "font-display text-[15px] font-bold leading-none";
