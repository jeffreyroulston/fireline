import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { typeSectionHeading } from "@/lib/utils/typography";

export function SectionHeading({
  title,
  meta,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(typeSectionHeading, "mb-4 [&_strong]:font-medium [&_strong]:text-foreground", className)}>
      <span>
        {title}
        {meta != null ? (
          <>
            {" "}
            [<span className="font-medium text-foreground">{meta}</span>]
          </>
        ) : null}
      </span>
    </div>
  );
}
