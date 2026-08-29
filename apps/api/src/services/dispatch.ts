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
import { postWorkerNdjson, WorkerError } from "./worker.js";

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
      phase: "started" | "rollout" | "done";
      rollout: number;
      totalRollouts: number;
    }
  | { kind: "result" } & DeckEvalResult
  | { kind: "error"; message: string };

type OptimizeEvent =
  | { kind: "progress" } & Record<string, unknown>
  | { kind: "result" } & OptimizeResult
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
      if (abort.signal.aborted) {
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
    while (true) {
      try {
        const { lines } = await postWorkerNdjson<EvaluateEvent>(
          this.workerBase,
          "/evaluate",
          body,
          signal,
        );
        for await (const event of lines) {
          if (event.kind === "progress") {
            const totalRollouts =
              event.totalRollouts ??
              (event as { total_rollouts?: number }).total_rollouts;
            const payload = {
              type: "progress" as const,
              sample: event.sample,
              total: event.total,
              ...(event.rollout != null ? { rollout: event.rollout } : {}),
              ...(totalRollouts != null ? { totalRollouts } : {}),
            };
            runHub.publish(runId, payload);
          } else if (event.kind === "handProgress") {
            const sampleIndex =
              event.sampleIndex ??
              (event as { sample_index?: number }).sample_index;
            const totalRollouts =
              event.totalRollouts ??
              (event as { total_rollouts?: number }).total_rollouts;
            if (sampleIndex == null || totalRollouts == null) {
              continue;
            }
            runHub.publish(runId, {
              type: "handProgress" as const,
              sampleIndex,
              phase: event.phase,
              rollout: event.rollout,
              totalRollouts,
            });
          } else if (event.kind === "error") {
            throw new Error(event.message);
          } else if (event.kind === "result") {
            const { kind: _kind, ...result } = event;
            await persistEvaluateResult(this.db, runId, result as DeckEvalResult);
            runHub.publish(runId, { type: "complete", result });
            return;
          }
        }
        throw new Error("Worker stream ended without a result");
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof WorkerError && error.status === 503) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        throw error;
      }
    }
  }

  private async processOptimize(
    runId: string,
    body: OptimizeRequest,
    signal: AbortSignal,
  ): Promise<void> {
    while (true) {
      try {
        const { lines } = await postWorkerNdjson<OptimizeEvent>(
          this.workerBase,
          "/optimize",
          body,
          signal,
        );
        for await (const event of lines) {
          if (event.kind === "progress") {
            const { kind: _kind, ...progress } = event;
            runHub.publish(runId, { type: "progress", ...progress });
          } else if (event.kind === "error") {
            throw new Error(event.message);
          } else if (event.kind === "result") {
            const { kind: _kind, ...result } = event;
            await persistOptimizeResult(this.db, runId, result as OptimizeResult);
            runHub.publish(runId, { type: "complete", result });
            return;
          }
        }
        throw new Error("Worker stream ended without a result");
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof WorkerError && error.status === 503) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        throw error;
      }
    }
  }
}
