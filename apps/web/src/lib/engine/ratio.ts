import type { CardId, OptimizeBounds } from "./types";
import { PLAYABLE_CARD_IDS } from "./cards";

/** Browser soft-cap for unique lists scored in one ratio run. */
export const MAX_RATIO_DECK_ATTEMPTS = 500;

/** Count legal decklists inside min/max bounds that sum to `deckSize`. */
export function countLegalDecklists(
  bounds: OptimizeBounds,
  deckSize: number,
  cardIds: CardId[] = PLAYABLE_CARD_IDS,
): bigint {
  if (!Number.isFinite(deckSize) || deckSize < 0) {
    return BigInt(0);
  }
  const size = Math.floor(deckSize);
  const ranges: Array<[number, number]> = [];
  let minTotal = 0;
  let maxTotal = 0;
  for (const id of cardIds) {
    const bound = bounds[id];
    if (!bound) continue;
    const lo = Math.max(0, Math.floor(bound.min));
    const hi = Math.max(lo, Math.floor(bound.max));
    ranges.push([lo, hi]);
    minTotal += lo;
    maxTotal += hi;
  }
  if (ranges.length === 0 || size < minTotal || size > maxTotal) {
    return BigInt(0);
  }

  let dp: bigint[] = Array.from({ length: size + 1 }, () => BigInt(0));
  dp[0] = BigInt(1);
  for (const [lo, hi] of ranges) {
    const prefix: bigint[] = Array.from({ length: size + 2 }, () => BigInt(0));
    for (let index = 0; index <= size; index += 1) {
      prefix[index + 1] = prefix[index] + dp[index];
    }
    const next: bigint[] = Array.from({ length: size + 1 }, () => BigInt(0));
    for (let sum = 0; sum <= size; sum += 1) {
      const right = sum - lo;
      const left = sum - hi;
      if (right < 0) continue;
      const from = Math.max(left, 0);
      const to = Math.min(right, size);
      if (from <= to) {
        next[sum] = prefix[to + 1] - prefix[from];
      }
    }
    dp = next;
  }
  return dp[size];
}

export function formatDecklistCount(count: bigint): string {
  const tiers: Array<[bigint, string]> = [
    [BigInt("1000000000000000000"), "Qi"], // quintillion
    [BigInt("1000000000000000"), "Qa"], // quadrillion
    [BigInt("1000000000000"), "T"],
    [BigInt("1000000000"), "B"],
    [BigInt("1000000"), "M"],
    [BigInt("1000"), "K"],
  ];

  for (const [divisor, suffix] of tiers) {
    if (count >= divisor) {
      const scaled = (count * BigInt(100)) / divisor;
      const whole = scaled / BigInt(100);
      const frac = scaled % BigInt(100);
      return `${whole}.${frac.toString().padStart(2, "0")}${suffix}`;
    }
  }
  return count.toString();
}

/** Percent of the full legal space covered by `attempts` (0–100). */
export function deckAttemptPercent(attempts: number, legal: bigint): number {
  if (legal <= BigInt(0) || attempts <= 0) return 0;
  const capped = BigInt(Math.max(0, Math.floor(attempts)));
  if (capped >= legal) return 100;
  // hundredths of a percent, then convert to 0–100
  const hundredths = (capped * BigInt(10000)) / legal;
  return Math.min(100, Number(hundredths) / 100);
}
