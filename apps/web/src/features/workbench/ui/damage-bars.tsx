import { cn } from "@/lib/utils/cn";

export type DamageBarItem = {
  key: string;
  damage: number;
  title: string;
  className?: string;
  disabled?: boolean;
};

const barButtonClass =
  "mb-[-1px] max-w-[42px] flex-1 origin-bottom cursor-pointer border-0 bg-gradient-to-b from-primary to-primary-dark p-0 animate-[bar-rise_450ms_cubic-bezier(0.2,0.8,0.2,1)_backwards] hover:brightness-[1.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2 disabled:cursor-not-allowed";

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
  const short = className?.includes("short");
  const pooledHistory = Boolean(
    className && /pooled-chart-plot-height/.test(className),
  );

  return (
    <div
      className={cn(
        "flex items-end border-b border-foreground gap-[5px]",
        !pooledHistory && (short ? "mt-4 h-[140px]" : "mt-8 h-[220px]"),
        className?.includes("is-two-pass") && "gap-2",
        className?.includes("is-monte-carlo") && "gap-2",
        className,
      )}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const selected = selectedKey === item.key;
        return (
          <button
            type="button"
            key={item.key}
            className={cn(
              barButtonClass,
              !item.className &&
                selected &&
                "bg-gradient-to-b from-[#f0c46a] to-primary-dark shadow-[inset_0_0_0_2px_var(--color-foreground)]",
              item.className,
            )}
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
