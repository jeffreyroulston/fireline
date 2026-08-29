import type { VersionGroup } from "@/lib/api/client";
import { cn, buttonVariants, chipVariants } from "@/lib/utils";
import {
  typeChipDisplay,
  typeChipDisplayMuted,
} from "@/lib/utils/typography";
import { deltaTone } from "./formatters";

export function groupKey(group: VersionGroup): string {
  return `${group.rulesVersion}:${group.samplerVersion}:${group.attributionVersion}`;
}

export function formatGroup(group: VersionGroup): string {
  return `r${group.rulesVersion} · s${group.samplerVersion} · a${group.attributionVersion ?? "?"}`;
}

export function formatRunTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const cardDbPanelClass = "grid w-full max-w-none gap-[18px]";

export const cardDbEmptyClass = "m-0 text-muted";

export const cardDbToolbarClass =
  "flex flex-wrap items-end gap-x-4 gap-y-3";

export const cardDbSearchClass = "flex-[1_1_180px]";

export function cardDbKindButtonClass(active: boolean) {
  return cn(
    "inline-flex h-[42px] items-center justify-center rounded-[2px] border border-border bg-surface px-2.5 font-display text-[13px] font-semibold tracking-[0.04em] text-foreground uppercase",
    active && "border-primary text-primary",
  );
}

export const cardDbSourcesClass =
  "border border-border bg-surface px-3.5 py-2.5";

export const cardDbSourcesSummaryClass =
  "cursor-pointer font-display text-sm font-semibold tracking-[0.02em]";

export const cardDbContributorListClass =
  "m-0 mt-2.5 grid list-none gap-2 p-0";

export const cardDbContributorItemClass = "grid gap-1";

export const cardDbContributorNameClass = "font-semibold";

export const cardDbContributorMetaClass = "text-[0.92em] text-muted";

export const cardDbGridPaneClass = "grid w-full gap-3.5";

export const cardDbGridClass =
  "grid w-full grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3";

export const cardDbTileImageClass =
  "aspect-[5/7] w-full border border-foreground/20 object-cover";

export function cardDbTileClass(empty?: boolean) {
  return cn(
    "m-0 flex min-w-0 cursor-pointer flex-col gap-1 border border-transparent bg-transparent p-0 text-left",
    empty &&
      "[&_img]:opacity-55 [&_img]:grayscale-[35%] [&>div]:opacity-55 [&>div]:grayscale-[35%]",
  );
}

export const cardDbTileNameClass =
  "overflow-hidden truncate font-display text-[11px] leading-[1.2] text-muted whitespace-nowrap";

export function cardDbChipClass(muted?: boolean) {
  return cn(muted ? typeChipDisplayMuted : typeChipDisplay);
}

export const cardDbOlderClass =
  "font-display text-[11px] font-bold tracking-[0.04em] uppercase text-secondary-dark";

export const cardDbDetailClass = "grid w-full gap-3.5";

export const cardDbDetailPanelClass =
  "min-w-0 border border-border bg-surface px-[18px] pb-4 pt-[18px]";

export const cardDbDetailHeroPanelClass = "p-5";

export const cardDbDetailSectionHeadingClass =
  "mb-3.5 text-xs font-semibold text-foreground";

export const cardDbDetailBarClass =
  "flex flex-wrap items-end justify-between gap-x-4 gap-y-3";

export const cardDbDetailFiltersClass =
  "flex min-w-0 flex-[1_1_280px] flex-nowrap items-end gap-x-4 gap-y-3 [&_.field]:min-w-0 [&_.field]:flex-[1_1_0]";

export function cardDbDetailHeroClass(hasPartnerPeek?: boolean) {
  return cn(
    "grid h-[500px] min-h-0 items-stretch gap-5 max-[700px]:h-auto",
    hasPartnerPeek &&
      "grid-cols-[minmax(0,3fr)_minmax(0,2fr)] max-[700px]:grid-cols-1",
  );
}

export const cardDbDetailHeroInfoClass =
  "flex h-full min-h-0 min-w-0 items-start gap-5 max-[700px]:h-auto max-[700px]:flex-col";

export const cardDbDetailHeroArtClass =
  "max-h-full w-fit max-w-full shrink-0 leading-none max-[700px]:w-full max-[700px]:max-w-[180px]";

export const cardDbDetailHeroArtImageClass =
  "block h-auto max-h-[500px] w-auto border border-border max-[700px]:aspect-[5/7] max-[700px]:h-auto max-[700px]:max-h-none max-[700px]:w-full max-[700px]:max-w-[180px]";

export const cardDbDetailHeroArtFallbackClass =
  "block box-border aspect-[5/7] h-auto max-h-[500px] w-auto border border-border max-[700px]:max-h-none max-[700px]:w-full max-[700px]:max-w-[180px]";

export const cardDbDetailHeroBodyClass =
  "grid min-w-0 flex-[1_1_auto] gap-3.5 self-start";

export const cardDbDetailTitleClass =
  "m-0 font-display text-4xl leading-none tracking-[-0.02em]";

export const cardDbHeroShortClass =
  "m-0 mt-1.5 font-mono text-[0.82rem] tracking-[0.02em] text-muted";

export const cardDbCardThumbClass =
  "aspect-[5/7] w-full border border-border object-cover";

export const cardDbHeroStatsClass = "grid gap-2.5";

export const cardDbHeroStatRowClass = "flex flex-wrap items-center gap-1.5";

export function cardDbHeroBadgeClass(fire?: boolean) {
  return cn(
    chipVariants({ tone: "default" }),
    "gap-1.5 rounded-full px-2.5 py-1 font-display text-xs font-semibold tracking-[0.04em] text-foreground uppercase",
    fire &&
      "border-[color-mix(in_srgb,var(--color-primary)_45%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_8%,white)] text-primary-dark",
  );
}

export function cardDbHeroBadgeLabelClass(fire?: boolean) {
  return cn(
    "text-[10px] font-medium tracking-[0.06em] text-muted",
    fire &&
      "text-[color-mix(in_srgb,var(--color-primary-dark)_70%,var(--color-muted))]",
  );
}

export const cardDbHeroCombatClass = "m-0 flex gap-4";

export const cardDbHeroCombatItemClass = "grid gap-0.5";

export const cardDbHeroCombatDtClass =
  "m-0 text-[0.72rem] tracking-[0.04em] uppercase text-muted";

export const cardDbHeroCombatDdClass =
  "m-0 font-display text-[22px] font-bold leading-none";

export const cardDbHeroTraitsClass =
  "m-0 flex list-none flex-wrap gap-1.5 p-0";

export const cardDbHeroTraitClass =
  "rounded-[2px] border border-border bg-[color-mix(in_srgb,var(--color-foreground)_3%,white)] px-2 py-[3px] text-[11px] leading-[1.35] text-muted";

export const cardDbPartnerPeekClass =
  "grid h-full min-h-0 min-w-0 content-start gap-3 max-[700px]:h-auto";

export const cardDbPartnerPeekLabelClass =
  "m-0 text-[0.78rem] tracking-[0.04em] uppercase text-muted";

export const cardDbPartnerPeekEmptyClass =
  "m-0 text-[0.9rem] leading-[1.45] text-muted";

export const cardDbPartnerPeekGridClass =
  "m-0 grid list-none grid-cols-3 gap-3.5 p-0 max-[700px]:grid-cols-[repeat(3,minmax(88px,1fr))]";

export const cardDbPartnerPeekTileClass =
  "group flex min-w-0 cursor-pointer flex-col items-stretch gap-2 border-0 bg-transparent p-0 text-left";

export const cardDbPartnerPeekThumbClass =
  "w-full max-w-none transition-[border-color,transform] duration-[160ms] ease-in-out group-hover:-translate-y-0.5 group-hover:border-foreground group-focus-visible:-translate-y-0.5 group-focus-visible:border-foreground";

export const cardDbPartnerPeekFallbackClass = "min-h-0 p-2.5";

export const cardDbPartnerPeekNameClass =
  "overflow-hidden truncate font-display text-[13px] font-semibold leading-[1.2] text-foreground whitespace-nowrap group-hover:text-primary-dark group-focus-visible:text-primary-dark";

export const cardDbStatsClass =
  "m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3";

export const cardDbStatsHandClass = "mb-3.5";

export const cardDbStatsItemClass = "grid gap-0.5";

export const cardDbStatsDtClass =
  "font-display text-[11px] tracking-[0.04em] uppercase text-muted";

export const cardDbStatsDdClass = "m-0 font-bold tabular-nums";

export const cardDbPlayWrapClass = "grid gap-2";

export const cardDbPlayMetaClass = "m-0 text-[0.85rem] text-muted";

export const cardDbPartnersClass = "grid gap-3";

export const cardDbPartnerModesClass = "flex flex-wrap gap-2";

export function cardDbPartnerModeButtonClass(active: boolean) {
  return cn(
    chipVariants({ tone: active ? "active" : "default" }),
    "cursor-pointer bg-transparent px-3 py-1.5 text-[0.85rem] normal-case tracking-normal",
    !active &&
      "hover:border-[color-mix(in_srgb,var(--color-border)_70%,var(--color-foreground))] hover:text-foreground focus-visible:border-[color-mix(in_srgb,var(--color-border)_70%,var(--color-foreground))] focus-visible:text-foreground",
  );
}

export function partnerDeltaClass(
  value: number,
  size: "default" | "peek" = "default",
) {
  return cn(
    "font-display font-bold leading-none",
    size === "peek" ? "text-[15px]" : "text-xs tracking-[0.02em]",
    deltaTone(value),
  );
}
