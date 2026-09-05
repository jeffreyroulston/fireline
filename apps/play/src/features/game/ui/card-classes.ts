import { cn } from "./cn";

export const cardTileBaseClass =
  "relative flex min-h-[102px] flex-col items-start justify-between overflow-hidden rounded-sm border border-border bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(226,235,235,0.9))] p-[13px] text-left transition-[border-color,transform] duration-150 ease-in-out hover:-translate-y-[3px] hover:border-foreground";

export const cardTileAccentClass =
  "absolute top-0 right-0 h-[5px] w-7 bg-foreground";

export const cardTileFireClass =
  "border-border hover:border-primary [&>span:first-child]:text-primary-dark";

export function cardTileClass(fire?: boolean) {
  return cn(cardTileBaseClass, fire && cardTileFireClass);
}

export function cardTileAccentClassFor(fire?: boolean) {
  return cn(cardTileAccentClass, fire && "bg-primary");
}

export const cardTileShellClass =
  "block w-full min-w-0 border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-accent/60 focus-visible:outline-offset-2";

export const cardTileImageClass =
  "block aspect-[5/7] w-full border border-foreground/20 bg-white object-cover transition-[border-color,transform] duration-150 ease-in-out group-hover:-translate-y-[3px] group-hover:border-foreground";

export const cardTileFallbackInnerClass =
  "pointer-events-none flex aspect-[5/7] w-full min-h-0 flex-col";

export const cardTileLabelClass =
  "font-mono text-[8px] tracking-[0.1em] text-muted";

export const cardTileTitleClass = "font-display text-lg leading-none";

export const cardTileMetaClass = "font-mono text-[9px] uppercase text-muted";
