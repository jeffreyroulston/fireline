import type { ReactNode } from "react";

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
    <div className={variant === "info" ? "info-topline" : "ratio-topline"}>
      <p className="kicker">{kicker}</p>
      {title != null &&
        (typeof title === "string" ? <h2>{title}</h2> : title)}
      {typeof children === "string" ? <p>{children}</p> : children}
    </div>
  );
}
