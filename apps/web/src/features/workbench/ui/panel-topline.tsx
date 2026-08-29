import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { kickerClass } from "@/lib/utils/card-classes";

export function PanelTopline({
  kicker,
  title,
  children,
  variant = "ratio",
}: {
  kicker: string;
  title?: ReactNode;
  children: ReactNode;
  variant?: "ratio" | "info";
}) {
  return (
    <div
      className={cn(
        "grid gap-2.5",
        variant === "info"
          ? "max-w-[56ch] gap-3"
          : "mb-[26px] max-w-[52ch] gap-2.5",
      )}
    >
      <p className={kickerClass}>{kicker}</p>
      {title != null &&
        (typeof title === "string" ? (
          <h2
            className={cn(
              variant === "info" &&
                "m-0 font-sans text-[28px] font-semibold tracking-[-0.02em] text-foreground leading-[1.2]",
            )}
          >
            {title}
          </h2>
        ) : (
          title
        ))}
      {typeof children === "string" ? (
        <p
          className={cn(
            "m-0 text-muted leading-relaxed",
            variant === "info" ? "text-base leading-[1.65]" : "text-sm leading-[1.6]",
          )}
        >
          {children}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
