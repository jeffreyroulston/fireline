import type { ReactNode } from "react";

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
    <div className={["section-heading", className].filter(Boolean).join(" ")}>
      <span>{title}</span>
      {meta}
    </div>
  );
}
