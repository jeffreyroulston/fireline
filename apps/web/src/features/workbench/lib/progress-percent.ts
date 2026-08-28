import type { OptimizeProgress } from "@/lib/api/useRun";

export function handProgressPercent(
  progress?: OptimizeProgress | null,
): number {
  if (!progress || progress.totalHands <= 0) {
    return 0;
  }
  return Math.min(
    100,
    Math.round((progress.handsSimulated / progress.totalHands) * 100),
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
    if (totalRollouts > 1) {
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
