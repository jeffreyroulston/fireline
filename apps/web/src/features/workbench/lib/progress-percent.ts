import type { OptimizeProgress } from "@/lib/api/useRun";

/** Fractional hand-equivalents from in-flight multi-bar rollouts (0..hands.length). */
function inFlightHandFraction(progress: OptimizeProgress): number {
  const hands = progress.hands;
  if (!hands || hands.length === 0) {
    return 0;
  }
  let fraction = 0;
  for (const hand of hands) {
    if (hand.totalRollouts <= 1) {
      // Non-MC / unknown: count a started hand as a small nudge so the bar moves.
      fraction += hand.phase === "started" ? 0.05 : 0.5;
      continue;
    }
    fraction += Math.min(1, hand.rolloutsDone / hand.totalRollouts);
  }
  return fraction;
}

function inFlightRolloutsDone(progress: OptimizeProgress): number {
  const hands = progress.hands;
  if (!hands || hands.length === 0) return 0;
  return hands.reduce((sum, hand) => sum + Math.max(0, hand.rolloutsDone), 0);
}

/** Job-wide rollout counts: finished hands × per-hand rollouts + in-flight ticks. */
export function aggregateRollouts(
  progress?: OptimizeProgress | null,
  totalRolloutsOverride?: number,
): { done: number; total: number } | null {
  if (!progress || progress.totalHands <= 0) return null;
  const perHand = totalRolloutsOverride ?? progress.totalRollouts ?? 0;
  if (perHand <= 1) return null;
  const done = progress.handsSimulated * perHand + inFlightRolloutsDone(progress);
  const total = progress.totalHands * perHand;
  return { done: Math.min(done, total), total };
}

export function handProgressPercent(
  progress?: OptimizeProgress | null,
): number {
  if (!progress || progress.totalHands <= 0) {
    return 0;
  }
  const completed = progress.handsSimulated + inFlightHandFraction(progress);
  return Math.min(
    100,
    Math.round((completed / progress.totalHands) * 100),
  );
}

export function rolloutProgressPercent(
  progress?: OptimizeProgress | null,
  totalRolloutsOverride?: number,
): number {
  const totalRollouts = totalRolloutsOverride ?? progress?.totalRollouts ?? 0;
  if (!progress || totalRollouts <= 1) {
    return 0;
  }
  const rolloutsDone = progress.rolloutsDone ?? 0;
  return Math.min(
    100,
    Math.round((rolloutsDone / totalRollouts) * 100),
  );
}

export function progressPercent(progress?: OptimizeProgress | null): number {
  if (!progress) return 0;
  if (progress.totalHands > 0) {
    const totalRollouts = progress.totalRollouts ?? 0;
    if (totalRollouts > 1 || (progress.hands?.length ?? 0) > 0) {
      return handProgressPercent(progress);
    }
    return Math.min(
      100,
      Math.round((progress.handsSimulated / progress.totalHands) * 100),
    );
  }
  if (progress.totalDecks > 0) {
    return Math.min(
      100,
      Math.round((progress.decksScored / progress.totalDecks) * 100),
    );
  }
  return 0;
}
