export type DamageBarItem = {
  key: string;
  damage: number;
  title: string;
  className?: string;
  disabled?: boolean;
};

export function DamageBars({
  items,
  scaleMax,
  selectedKey = null,
  onSelect,
  ariaLabel,
  className,
}: {
  items: DamageBarItem[];
  scaleMax: number;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const max = Math.max(scaleMax, 1);

  return (
    <div
      className={["damage-bars", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const selected = selectedKey === item.key;
        return (
          <button
            type="button"
            key={item.key}
            className={
              [selected ? "is-selected" : "", item.className]
                .filter(Boolean)
                .join(" ") || undefined
            }
            style={{
              height: `${Math.max(8, (item.damage / max) * 100)}%`,
            }}
            title={item.title}
            aria-pressed={selected}
            disabled={item.disabled}
            onClick={() => onSelect?.(selected ? null : item.key)}
          />
        );
      })}
    </div>
  );
}
