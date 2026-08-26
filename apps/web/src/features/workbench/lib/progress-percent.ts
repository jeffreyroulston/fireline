import type { OptimizeProgress } from "@/lib/api/useRun";

export function progressPercent(progress?: OptimizeProgress | null): number {
  if (!progress) return 0;
  if (progress.totalHands > 0) {
    const totalRollouts = progress.totalRollouts ?? 0;
    if (totalRollouts > 1) {
      const done =
        progress.handsSimulated * totalRollouts + (progress.rolloutsDone ?? 0);
      const total = progress.totalHands * totalRollouts;
      return Math.min(100, Math.round((done / Math.max(total, 1)) * 100));
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
