"use client";

import { cn } from "@/lib/utils/cn";

export function McRangeColumn({
  min,
  max,
  p50,
  scaleMax,
  selected,
  title,
  onClick,
}: {
  min: number;
  max: number;
  p50: number;
  scaleMax: number;
  selected?: boolean;
  title: string;
  onClick: () => void;
}) {
  const whiskerBottom = (min / scaleMax) * 100;
  const whiskerHeight = Math.max(((max - min) / scaleMax) * 100, 1.5);

  return (
    <button
      type="button"
      className={cn(
        "mb-[-1px] flex h-full max-w-[42px] flex-1 cursor-pointer items-stretch justify-center border-0 bg-transparent p-0",
        "hover:outline hover:outline-2 hover:outline-foreground hover:outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2",
        selected &&
          "bg-[color-mix(in_srgb,var(--color-surface-muted)_80%,transparent)] outline outline-2 outline-foreground outline-offset-2",
      )}
      title={title}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="relative mx-auto h-full w-full max-w-4">
        <span
          className={cn(
            "absolute left-1/2 -ml-px w-0.5 bg-foreground opacity-45",
            selected && "opacity-75",
          )}
          style={{ bottom: `${whiskerBottom}%`, height: `${whiskerHeight}%` }}
        />
        <span
          className={cn(
            "absolute right-0 bottom-0 left-0 origin-bottom bg-gradient-to-b from-primary to-primary-dark animate-[bar-rise_450ms_cubic-bezier(0.2,0.8,0.2,1)_backwards]",
            selected &&
              "bg-gradient-to-b from-[#f0c46a] to-primary-dark shadow-[inset_0_0_0_1px_var(--color-foreground)]",
          )}
          style={{ height: `${Math.max(8, (p50 / scaleMax) * 100)}%` }}
        />
      </span>
    </button>
  );
}
