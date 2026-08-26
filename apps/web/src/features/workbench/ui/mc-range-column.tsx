"use client";

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
      className={`mc-range-col ${selected ? "is-selected" : ""}`}
      title={title}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="mc-range-track">
        <span
          className="mc-whisker"
          style={{ bottom: `${whiskerBottom}%`, height: `${whiskerHeight}%` }}
        />
        <span
          className="mc-fill"
          style={{ height: `${Math.max(8, (p50 / scaleMax) * 100)}%` }}
        />
      </span>
    </button>
  );
}
