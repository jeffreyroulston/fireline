import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function DamageReadout({
  label,
  value,
  detail,
  calculating,
  size = "hero",
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  calculating?: boolean;
  /** `hero` for result rails; `lg` for sample / line inspectors. */
  size?: "hero" | "lg";
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-end overflow-visible border-b border-foreground pb-5 [&>small]:font-mono [&>small]:text-[10px] [&>small]:tracking-[0.08em] [&>small]:text-muted [&>span]:font-mono [&>span]:text-[10px] [&>span]:tracking-[0.08em] [&>span]:text-muted">
      <span>{label}</span>
      <strong
        className={cn(
          "col-start-2 row-span-2 flex items-baseline font-display leading-[0.85] text-primary",
          size === "lg"
            ? "text-[clamp(48px,5.5vw,72px)]"
            : "text-[clamp(72px,8vw,120px)]",
          calculating && "animate-[damage-pulse_900ms_ease-in-out_infinite_alternate]",
        )}
      >
        {value}
      </strong>
      {detail != null && <small>{detail}</small>}
    </div>
  );
}
