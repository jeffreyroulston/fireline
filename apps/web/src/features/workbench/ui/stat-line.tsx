import type { ReactNode } from "react";

export type StatLineItem = {
  label: ReactNode;
  value: ReactNode;
  after?: ReactNode;
};

export function StatLine({
  items,
  className,
}: {
  items: StatLineItem[];
  className?: string;
}) {
  return (
    <div className={["stat-line", className].filter(Boolean).join(" ")}>
      {items.map((item, index) => (
        <span key={index}>
          <small>{item.label}</small>
          <b>{item.value}</b>
          {item.after}
        </span>
      ))}
    </div>
  );
}
