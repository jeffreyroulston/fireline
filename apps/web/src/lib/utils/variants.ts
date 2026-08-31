import { type VariantProps, cva } from "class-variance-authority";
import {
  typeControlButton,
  typeNavTab,
  typePillTab,
} from "./typography";

export const buttonVariants = cva(
  cnBase("cursor-pointer disabled:cursor-wait disabled:opacity-72", typeControlButton),
  {
    variants: {
      intent: {
        primary:
          "flex min-h-[50px] min-w-[260px] items-center justify-between gap-[30px] border-0 bg-foreground px-[18px] text-white transition-[background,transform] duration-150 ease-in-out enabled:hover:translate-x-[3px] enabled:hover:bg-primary-dark",
        secondary:
          "border border-foreground bg-transparent",
        text: "border-0 bg-transparent text-muted underline underline-offset-4",
      },
      size: {
        default: "h-[42px] px-4",
        compact: "h-auto px-3 py-1.5 text-[12px]",
        inline: "h-auto px-1 py-2.5",
      },
      danger: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        intent: "text",
        size: "default",
        className: "h-auto px-1 py-2.5",
      },
      {
        intent: "text",
        danger: true,
        className: "text-primary-dark",
      },
    ],
    defaultVariants: {
      intent: "primary",
      size: "default",
      danger: false,
    },
  },
);

export const chipVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide",
  {
    variants: {
      tone: {
        default: "border-border text-muted",
        active: "border-foreground text-foreground",
        hotter: "text-primary-dark",
        cooler: "text-secondary-dark",
        muted: "text-muted",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

/** Underline tabs in the workbench masthead nav. */
export const navTabVariants = cva(
  cnBase(
    "relative inline-block min-w-[150px] border-0 bg-transparent px-5 py-[15px] text-center text-muted no-underline",
    typeNavTab,
    "after:absolute after:right-0 after:bottom-[-2px] after:left-0 after:h-1 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-[180ms] after:ease-in-out after:content-[''] hover:text-foreground max-[620px]:min-w-[122px] max-[620px]:px-3",
  ),
  {
    variants: {
      active: {
        true: "font-semibold text-foreground after:scale-x-100",
        false: "",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

/** Segmented pill tabs (solver mode, ratio strategy, leaderboard pass). */
export const pillTabVariants = cva(
  cnBase(
    "m-0 cursor-pointer appearance-none border-0 px-3.5 py-1.5 font-normal text-muted hover:text-foreground focus-visible:text-foreground",
    typePillTab,
  ),
  {
    variants: {
      active: {
        true: "bg-surface text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-foreground)_12%,transparent)]",
        false: "bg-transparent",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

export const pillTabListClass =
  "flex w-fit max-w-full gap-1 bg-[color-mix(in_srgb,var(--color-foreground)_6%,var(--color-surface-muted))] p-[3px]";

export type RunStatus =
  | "complete"
  | "failed"
  | "interrupted"
  | "running"
  | "queued"
  | string;

export const statusBadgeVariants = cva(
  "relative inline-block border border-border bg-transparent px-2 py-0.5 font-mono text-[9px] tracking-[0.06em] uppercase text-muted",
  {
    variants: {
      tone: {
        default: "",
        complete:
          "border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_12%,white)] text-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-foreground))]",
        failed:
          "border-[color-mix(in_srgb,var(--color-primary)_45%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_12%,white)] text-primary-dark",
        live:
          "border-[color-mix(in_srgb,var(--color-secondary)_45%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-secondary)_10%,white)] text-secondary-dark",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

export function statusBadgeTone(status: string): VariantProps<
  typeof statusBadgeVariants
>["tone"] {
  if (status === "complete" || status === "partial") return "complete";
  if (status === "failed" || status === "interrupted") return "failed";
  if (status === "running" || status === "queued") return "live";
  return "default";
}

/** @deprecated Use navTabVariants or pillTabVariants instead. */
export const tabVariants = navTabVariants;

export type ButtonVariants = VariantProps<typeof buttonVariants>;
export type ChipVariants = VariantProps<typeof chipVariants>;
export type NavTabVariants = VariantProps<typeof navTabVariants>;
export type PillTabVariants = VariantProps<typeof pillTabVariants>;
export type StatusBadgeVariants = VariantProps<typeof statusBadgeVariants>;

function cnBase(...parts: string[]) {
  return parts.join(" ");
}
