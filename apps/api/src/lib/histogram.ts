/** Merge 256-bucket damage histograms from multiple runs. */
export function mergeHistograms(histograms: number[][]): number[] {
  const merged = Array.from({ length: 256 }, () => 0);
  for (const histogram of histograms) {
    for (let damage = 0; damage < 256; damage += 1) {
      merged[damage] += histogram[damage] ?? 0;
    }
  }
  return merged;
}

function percentileFromHistogram(buckets: number[], percentile: number): number {
  const total = buckets.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return 0;
  }
  const target = (percentile / 100) * total;
  let cumulative = 0;
  for (let damage = 0; damage < buckets.length; damage += 1) {
    cumulative += buckets[damage] ?? 0;
    if (cumulative >= target) {
      return damage;
    }
  }
  return buckets.length - 1;
}

export interface HistogramStats {
  totalSamples: number;
  mean: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  buckets: number[];
}

export function histogramStats(buckets: number[]): HistogramStats | null {
  let totalSamples = 0;
  let weightedSum = 0;
  let min = 255;
  let max = 0;

  for (let damage = 0; damage < buckets.length; damage += 1) {
    const count = buckets[damage] ?? 0;
    if (count === 0) {
      continue;
    }
    totalSamples += count;
    weightedSum += damage * count;
    min = Math.min(min, damage);
    max = Math.max(max, damage);
  }

  if (totalSamples === 0) {
    return null;
  }

  return {
    totalSamples,
    mean: weightedSum / totalSamples,
    p50: percentileFromHistogram(buckets, 50),
    p90: percentileFromHistogram(buckets, 90),
    min,
    max,
    buckets,
  };
}
