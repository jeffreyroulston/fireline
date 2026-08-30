import type { DeckResult, RatioResult } from "@/features/workbench/types";

export type HandPhase = "started" | "throttled" | "rollout" | "done";

export type MemoryPressureLevel = "squeeze" | "parked";

export interface HandProgress {
  sampleIndex: number;
  phase: HandPhase;
  rolloutsDone: number;
  totalRollouts: number;
}

export interface OptimizeProgress {
  decksScored: number;
  totalDecks: number;
  legalDecks: number;
  handsSimulated: number;
  totalHands: number;
  bestScore: number;
  /** Monte Carlo: rollouts finished on the current hand. */
  rolloutsDone?: number;
  /** Monte Carlo: rollouts per opening hand. */
  totalRollouts?: number;
  /** In-flight opening hands (evaluate runs with concurrent hand progress). */
  hands?: HandProgress[];
  /** Set once the worker has begun processing (not just queued locally). */
  started?: boolean;
  /** Live memory pressure on the worker (omit / clear when idle). */
  memoryPressure?: MemoryPressureLevel;
}

export type RunKind = "evaluate" | "optimize";

export type WorkerState = "idle" | "running" | "finished" | "failed" | "offline";

export interface ActiveRunRow {
  id: string;
  kind: RunKind | string;
  status: string;
  deck_id: string | null;
  sim_type: string | null;
  samples: number | null;
  rollouts: number | null;
  decks_requested: number | null;
  error_message: string | null;
  mean_damage: number | null;
  p50_damage: number | null;
  p90_damage: number | null;
  best_score: number | null;
  completed_at: string | null;
  started_at?: string | null;
}

export interface TrackedRun {
  id: string;
  kind: RunKind;
  deckId: string;
  deckName: string;
  status: string;
  progress: OptimizeProgress | null;
  deckResult: DeckResult | null;
  ratioResult: RatioResult | null;
  error: string | null;
  /** ISO timestamp when available; used to pick the latest terminal run per deck. */
  completedAt: string | null;
}

export interface QueueRunItem {
  run: ActiveRunRow;
  deckName: string;
}

export interface RunQueueResponse {
  workerReachable: boolean;
  maxConcurrency: number;
  running: QueueRunItem[];
  queued: QueueRunItem[];
  finished: QueueRunItem[];
}

export function isLiveRunStatus(status: string): boolean {
  return status === "queued" || status === "running";
}

export function isTerminalRunStatus(status: string): boolean {
  return (
    status === "complete" ||
    status === "failed" ||
    status === "interrupted" ||
    status === "cancelled"
  );
}

/** Failed / interrupted / cancelled — keep these ahead of stale complete results. */
export function isUnsuccessfulTerminalStatus(status: string): boolean {
  return (
    status === "failed" ||
    status === "interrupted" ||
    status === "cancelled"
  );
}

export function isFinishedQueueStatus(status: string): boolean {
  return status === "complete" || isUnsuccessfulTerminalStatus(status);
}

export function queueSummaryLabel(
  runningCount: number,
  queuedCount: number,
  maxConcurrency: number,
): string {
  if (runningCount === 0 && queuedCount === 0) {
    return "Idle";
  }
  const parts: string[] = [];
  if (runningCount > 0) {
    parts.push(`${runningCount}/${maxConcurrency} running`);
  }
  if (queuedCount > 0) {
    parts.push(`${queuedCount} queued`);
  }
  return parts.join(" · ");
}

export function aggregateWorkerState(
  workerReachable: boolean,
  liveCount: number,
  visibleFinishedCount: number,
): WorkerState {
  if (!workerReachable) {
    return "offline";
  }
  if (liveCount > 0) {
    return "running";
  }
  if (visibleFinishedCount > 0) {
    return "finished";
  }
  return "idle";
}
