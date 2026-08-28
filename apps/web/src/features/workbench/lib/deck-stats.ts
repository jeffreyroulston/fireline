/** Histogram indexed by integer damage. Extra trailing zeros are fine for KDE. */
export function histogramFromDamages(damages: number[]): number[] {
  if (damages.length === 0) {
    return [];
  }
  const high = Math.max(0, ...damages);
  const buckets = Array.from({ length: high + 1 }, () => 0);
  for (const damage of damages) {
    if (damage >= 0) {
      buckets[Math.min(high, damage)] += 1;
    }
  }
  return buckets;
}

export function percentileFromValues(
  values: number[],
  percentile: number,
): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((percentile * sorted.length) / 100),
  );
  return sorted[index] ?? 0;
}

export function meanOf(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatOptionalStat(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return digits > 0 ? value.toFixed(digits) : String(value);
}
