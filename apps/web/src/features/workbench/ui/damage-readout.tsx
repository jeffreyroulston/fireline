import type { ReactNode } from "react";

export function DamageReadout({
  label,
  value,
  detail,
  calculating,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  calculating?: boolean;
}) {
  return (
    <div className="damage-readout">
      <span>{label}</span>
      <strong className={calculating ? "calculating" : undefined}>{value}</strong>
      {detail != null && <small>{detail}</small>}
    </div>
  );
}
