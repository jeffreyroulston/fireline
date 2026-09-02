import type { Kysely } from "kysely";
import type { DeckEvalRequest, DeckEvalResult, OptimizeRequest, OptimizeResult } from "@ga-fire/contracts";
import type { Database, RunKind } from "../db/types.js";
import {
  markRunCancelled,
  markRunFailed,
  markRunRunning,
  persistEvaluateResult,
  persistOptimizeResult,
} from "./persist.js";
import { runHub } from "./run-hub.js";
import { fetchWorkerJson } from "./worker.js";
import { consumeWorkerStream } from "./worker-stream.js";

type EvaluateEvent =
  | {
      kind: "progress";
      sample: number;
      total: number;
      rollout?: number;
      totalRollouts?: number;
    }
  | {
      kind: "handProgress";
      sampleIndex: number;
      phase: "started" | "throttled" | "rollout" | "done";
      rollout: number;
      totalRollouts: number;
    }
  | { kind: "memoryPressure"; level: "clear" | "squeeze" | "parked" }
  | { kind: "heartbeat" }
  | { kind: "result" } & DeckEvalResult
  | { kind: "partialResult" } & DeckEvalResult
  | { kind: "error"; message: string };

type OptimizeEvent =
  | { kind: "progress" } & Record<string, unknown>
  | {
      kind: "handProgress";
      sampleIndex?: number;
      sample_index?: number;
      phase: "started" | "throttled" | "rollout" | "done" | "timedOut";
      rollout: number;
      totalRollouts?: number;
      total_rollouts?: number;
    }
  | { kind: "memoryPressure"; level: "clear" | "squeeze" | "parked" }
  | { kind: "heartbeat" }
  | { kind: "result" } & OptimizeResult
  | { kind: "partialResult" } & OptimizeResult
  | { kind: "error"; message: string };

export class ConcurrencyGate {
  private active = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.active >= this.max) {
      return false;
    }
    this.active += 1;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }
}

interface DispatchJob {
  runId: string;
  kind: RunKind;
  body: Record<string, unknown>;
}

export class RunDispatcher {
  private readonly queue: DispatchJob[] = [];
  private draining = false;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly workerBase: string,
    private readonly gate: ConcurrencyGate,
  ) {}

  enqueue(job: DispatchJob): void {
    runHub.register(job.runId);
    this.queue.push(job);
    void this.drain();
  }

  cancel(runId: string): void {
    const index = this.queue.findIndex((job) => job.runId === runId);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
    runHub.getAbort(runId)?.abort();
  }

  /** Stop a running job and persist finished work. Queued jobs are cancelled. */
  requestSave(runId: string): "queued" | "running" {
    const index = this.queue.findIndex((job) => job.runId === runId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      return "queued";
    }
    void fetchWorkerJson(this.workerBase, `/jobs/${runId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ save: true }),
    }).catch(() => {
      // Job is not registered on the worker yet, or already finished.
    });
    return "running";
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        if (!this.gate.tryAcquire()) {
          return;
        }
        const job = this.queue.shift();
        if (!job) {
          this.gate.release();
          continue;
        }
        void this.process(job).finally(() => {
          this.gate.release();
          void this.drain();
        });
      }
    } finally {
      this.draining = false;
    }
  }

  private async process(job: DispatchJob): Promise<void> {
    const abort = runHub.register(job.runId);
    try {
      await markRunRunning(this.db, job.runId);
      if (job.kind === "evaluate") {
        await this.processEvaluate(job.runId, job.body as DeckEvalRequest, abort.signal);
      } else {
        await this.processOptimize(job.runId, job.body as OptimizeRequest, abort.signal);
      }
    } catch (error) {
      if (abort.signal.aborted || isCancelError(error)) {
        await markRunCancelled(this.db, job.runId);
        runHub.publish(job.runId, { type: "cancelled" });
      } else {
        const message = error instanceof Error ? error.message : "Run failed";
        await markRunFailed(this.db, job.runId, message);
        runHub.publish(job.runId, { type: "error", message });
      }
    } finally {
      runHub.close(job.runId);
    }
  }

  private async processEvaluate(
    runId: string,
    body: DeckEvalRequest,
    signal: AbortSignal,
  ): Promise<void> {
    const { result, partial } = await consumeWorkerStream<EvaluateEvent, DeckEvalResult>({
      workerBase: this.workerBase,
      path: "/evaluate",
      body,
      signal,
      headers: { "X-Run-Id": runId },
      onEvent: (event) => {
        if (event.kind === "progress") {
          const totalRollouts =
            event.totalRollouts ??
            (event as { total_rollouts?: number }).total_rollouts;
          runHub.publish(runId, {
            type: "progress",
            sample: event.sample,
            total: event.total,
            ...(event.rollout != null ? { rollout: event.rollout } : {}),
            ...(totalRollouts != null ? { totalRollouts } : {}),
          });
          return;
        }
        if (event.kind === "handProgress") {
          const sampleIndex =
            event.sampleIndex ??
            (event as { sample_index?: number }).sample_index;
          const totalRollouts =
            event.totalRollouts ??
            (event as { total_rollouts?: number }).total_rollouts;
          if (sampleIndex == null || totalRollouts == null) {
            return;
          }
          runHub.publish(runId, {
            type: "handProgress",
            sampleIndex,
            phase: event.phase,
            rollout: event.rollout,
            totalRollouts,
          });
          return;
        }
        if (event.kind === "memoryPressure") {
          runHub.publish(runId, {
            type: "memoryPressure",
            level: event.level,
          });
        }
      },
    });
    const status = partial ? "partial" : "complete";
    await persistEvaluateResult(this.db, runId, result, status);
    runHub.publish(runId, {
      type: "complete",
      result,
      ...(partial ? { partial: true } : {}),
    });
  }

  private async processOptimize(
    runId: string,
    body: OptimizeRequest,
    signal: AbortSignal,
  ): Promise<void> {
    const { result, partial } = await consumeWorkerStream<OptimizeEvent, OptimizeResult>({
      workerBase: this.workerBase,
      path: "/optimize",
      body,
      signal,
      headers: { "X-Run-Id": runId },
      onEvent: (event) => {
        if (event.kind === "progress") {
          const { kind: _kind, ...progress } = event;
          runHub.publish(runId, { type: "progress", ...progress });
          return;
        }
        if (event.kind === "handProgress") {
          const sampleIndex = event.sampleIndex ?? event.sample_index;
          const totalRollouts = event.totalRollouts ?? event.total_rollouts;
          if (sampleIndex == null || totalRollouts == null) {
            return;
          }
          runHub.publish(runId, {
            type: "handProgress",
            sampleIndex,
            phase: event.phase,
            rollout: event.rollout,
            totalRollouts,
          });
          return;
        }
        if (event.kind === "memoryPressure") {
          runHub.publish(runId, {
            type: "memoryPressure",
            level: event.level,
          });
        }
      },
    });
    const status = partial ? "partial" : "complete";
    await persistOptimizeResult(this.db, runId, result, status);
    runHub.publish(runId, {
      type: "complete",
      result,
      ...(partial ? { partial: true } : {}),
    });
  }
}

function isCancelError(error: unknown): boolean {
  return error instanceof Error && error.message === "cancelled";
}
