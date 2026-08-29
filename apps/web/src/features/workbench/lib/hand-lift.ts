import type { TwoPassResult } from "@/lib/engine";

export const MIN_HAND_BUCKET_SAMPLES = 5;

type WeightedDamage = { damage: number; weight: number };

function weightedMean(entries: WeightedDamage[]): number | null {
  if (entries.length === 0) {
    return null;
  }
  let totalWeight = 0;
  let totalDamage = 0;
  for (const entry of entries) {
    totalWeight += entry.weight;
    totalDamage += entry.damage * entry.weight;
  }
  if (totalWeight <= 0) {
    return null;
  }
  return totalDamage / totalWeight;
}

function weightedCount(entries: WeightedDamage[]): number {
  return entries.reduce((sum, entry) => sum + entry.weight, 0);
}

function finalizeHandLift(
  withHand: WeightedDamage[],
  withoutHand: WeightedDamage[],
): number | null {
  const withHandSamples = weightedCount(withHand);
  const withoutHandSamples = weightedCount(withoutHand);
  if (
    withHandSamples < MIN_HAND_BUCKET_SAMPLES ||
    withoutHandSamples < MIN_HAND_BUCKET_SAMPLES
  ) {
    return null;
  }
  const withHandMean = weightedMean(withHand);
  const withoutHandMean = weightedMean(withoutHand);
  if (withHandMean == null || withoutHandMean == null) {
    return null;
  }
  return withHandMean - withoutHandMean;
}

function sampleDamage(
  hand: { damage: number; twoPass?: TwoPassResult },
  pass?: "brick" | "oracle",
): number {
  if (pass === "brick") {
    return hand.twoPass?.brick.maxDamage ?? hand.damage;
  }
  if (pass === "oracle") {
    return hand.twoPass?.oracle.maxDamage ?? hand.damage;
  }
  return hand.damage;
}

export function computeHandLiftByCard(
  hands: Array<{ hand: string[]; damage: number; twoPass?: TwoPassResult }>,
  deckCardIds: Iterable<string>,
  pass?: "brick" | "oracle",
): Map<string, number | null> {
  const deckCards = new Set(deckCardIds);
  const withBuckets = new Map<string, WeightedDamage[]>();
  const withoutBuckets = new Map<string, WeightedDamage[]>();

  for (const sample of hands) {
    const opening = new Set(sample.hand);
    const entry = {
      damage: sampleDamage(sample, pass),
      weight: 1,
    };
    for (const cardId of deckCards) {
      if (opening.has(cardId)) {
        const bucket = withBuckets.get(cardId) ?? [];
        bucket.push(entry);
        withBuckets.set(cardId, bucket);
      } else {
        const bucket = withoutBuckets.get(cardId) ?? [];
        bucket.push(entry);
        withoutBuckets.set(cardId, bucket);
      }
    }
  }

  const lifts = new Map<string, number | null>();
  for (const cardId of deckCards) {
    lifts.set(
      cardId,
      finalizeHandLift(
        withBuckets.get(cardId) ?? [],
        withoutBuckets.get(cardId) ?? [],
      ),
    );
  }
  return lifts;
}

export function formatLift(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const text = abs.toFixed(1);
  return value > 0 ? `+${text}` : `−${text}`;
}

export { deltaTextClass as liftDeltaTone } from "@/lib/utils/ui-classes";
