import { postWorkerNdjson, WorkerError } from "./worker.js";

export type WorkerStreamTerminalKind = "result" | "partialResult";

export interface WorkerStreamEvent {
  kind: string;
  message?: string;
}

export interface ConsumeWorkerStreamOptions<TEvent extends WorkerStreamEvent> {
  workerBase: string;
  path: string;
  body: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  onEvent?: (event: TEvent) => void | Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalKind(kind: string): kind is WorkerStreamTerminalKind {
  return kind === "result" || kind === "partialResult";
}

/**
 * Open a long-lived NDJSON POST to the worker, keep the connection alive via
 * heartbeats, and return when a terminal result event arrives.
 */
export async function consumeWorkerStream<
  TEvent extends WorkerStreamEvent,
  TResult extends Record<string, unknown>,
>(
  options: ConsumeWorkerStreamOptions<TEvent>,
): Promise<{ result: TResult; partial: boolean }> {
  while (true) {
    try {
      const { lines } = await postWorkerNdjson<TEvent>(
        options.workerBase,
        options.path,
        options.body,
        options.signal,
        options.headers,
      );
      for await (const event of lines) {
        if (event.kind === "heartbeat") {
          continue;
        }
        if (event.kind === "error") {
          throw new Error(event.message ?? "Worker error");
        }
        if (isTerminalKind(event.kind)) {
          const { kind, ...result } = event as TEvent & TResult;
          return {
            result: result as TResult,
            partial: kind === "partialResult",
          };
        }
        await options.onEvent?.(event);
      }
      throw new Error("Worker stream ended without a result");
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }
      if (error instanceof WorkerError && error.status === 503) {
        await sleep(1000);
        continue;
      }
      throw error;
    }
  }
}

export interface ProxyWorkerStreamOptions<TEvent extends WorkerStreamEvent> {
  workerBase: string;
  path: string;
  body: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  onEvent?: (event: TEvent) => Promise<Record<string, unknown> | null | void>;
}

/**
 * Proxy worker NDJSON to a writable sink, optionally transforming events
 * (e.g. enrich a terminal result before forwarding).
 */
export async function proxyWorkerStream<TEvent extends WorkerStreamEvent>(
  options: ProxyWorkerStreamOptions<TEvent>,
  write: (line: string) => Promise<void>,
): Promise<void> {
  while (true) {
    try {
      const { lines } = await postWorkerNdjson<TEvent>(
        options.workerBase,
        options.path,
        options.body,
        options.signal,
        options.headers,
      );
      for await (const event of lines) {
        if (event.kind === "error") {
          await write(`${JSON.stringify(event)}\n`);
          return;
        }
        if (isTerminalKind(event.kind)) {
          const transformed = (await options.onEvent?.(event)) ?? event;
          await write(`${JSON.stringify(transformed)}\n`);
          return;
        }
        const transformed = (await options.onEvent?.(event)) ?? event;
        if (transformed != null) {
          await write(`${JSON.stringify(transformed)}\n`);
        }
      }
      throw new Error("Worker stream ended without a result");
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }
      if (error instanceof WorkerError && error.status === 503) {
        await sleep(1000);
        continue;
      }
      throw error;
    }
  }
}
