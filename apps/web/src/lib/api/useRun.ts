"use client";

import { useCallback, useEffect, useRef } from "react";
import { createRun, deleteRun, runEventsUrl } from "./client";

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
  /** Set once the worker has begun processing (not just queued locally). */
  started?: boolean;
}

type RunKind = "evaluate" | "optimize";

interface StreamHandlers {
  onProgress: (progress: OptimizeProgress) => void;
  onComplete: (result: unknown) => void;
  onError: (message: string) => void;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function coerceOptimizeProgress(
  data: Record<string, unknown>,
): OptimizeProgress | null {
  const sample = asNumber(data.sample);
  const total = asNumber(data.total);
  if (sample != null && total != null) {
    const rolloutsDone =
      asNumber(data.rollout) ?? asNumber(data.rolloutsDone);
    const totalRollouts =
      asNumber(data.totalRollouts) ?? asNumber(data.total_rollouts);
    return {
      decksScored: 0,
      totalDecks: 0,
      legalDecks: 0,
      handsSimulated: sample,
      totalHands: total,
      bestScore: 0,
      ...(rolloutsDone != null ? { rolloutsDone } : {}),
      ...(totalRollouts != null ? { totalRollouts } : {}),
    };
  }
  const decksScored = asNumber(data.decksScored);
  const totalDecks = asNumber(data.totalDecks);
  if (decksScored == null || totalDecks == null) {
    return null;
  }
  return {
    decksScored,
    totalDecks,
    legalDecks: asNumber(data.legalDecks) ?? 0,
    handsSimulated: asNumber(data.handsSimulated) ?? 0,
    totalHands: asNumber(data.totalHands) ?? 0,
    bestScore: asNumber(data.bestScore) ?? 0,
  };
}

export function mergeOptimizeProgress(
  current: OptimizeProgress | null | undefined,
  update: OptimizeProgress,
): OptimizeProgress {
  return {
    decksScored: 0,
    totalDecks: 0,
    legalDecks: 0,
    handsSimulated: 0,
    totalHands: 0,
    bestScore: 0,
    ...current,
    ...update,
    totalRollouts: update.totalRollouts ?? current?.totalRollouts,
    started: true,
  };
}

async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^\s/, ""))
        .join("\n");
      if (!data) {
        continue;
      }
      yield JSON.parse(data) as Record<string, unknown>;
    }
  }
}

function dispatchSseEvent(
  data: Record<string, unknown>,
  handlers: StreamHandlers,
): boolean {
  if (data.type === "progress") {
    const progress = coerceOptimizeProgress(data);
    if (progress) {
      handlers.onProgress(progress);
    }
    return false;
  }
  if (data.type === "complete") {
    handlers.onComplete(data.result);
    return true;
  }
  if (data.type === "error") {
    handlers.onError(
      typeof data.message === "string" ? data.message : "Run failed.",
    );
    return true;
  }
  if (data.type === "cancelled") {
    handlers.onError("Calculation cancelled.");
    return true;
  }
  return false;
}

export function useRun() {
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const settledRef = useRef(false);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const cancel = useCallback(async () => {
    settledRef.current = true;
    const runId = runIdRef.current;
    cleanup();
    if (runId) {
      try {
        await deleteRun(runId);
      } catch {
        // Stream close or server cancel is enough for UI teardown.
      }
    }
  }, [cleanup]);

  const startStreamingRun = useCallback(
    async (
      kind: RunKind,
      payload: Record<string, unknown>,
      deckId: string,
      handlers: StreamHandlers,
    ) => {
      cleanup();
      settledRef.current = false;
      const { id } = await createRun(kind, payload, deckId);
      runIdRef.current = id;

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const response = await fetch(runEventsUrl(id), {
          signal: abort.signal,
          headers: { Accept: "text/event-stream" },
          cache: "no-store",
        });
        if (!response.ok || !response.body) {
          throw new Error(
            `Run stream failed (${response.status || "no body"}).`,
          );
        }
        for await (const data of readSse(response.body)) {
          if (abort.signal.aborted) {
            return;
          }
          if (dispatchSseEvent(data, handlers)) {
            settledRef.current = true;
            cleanup();
            return;
          }
        }
        if (!settledRef.current && !abort.signal.aborted) {
          handlers.onError("Lost connection to the run stream.");
          cleanup();
        }
      } catch (error) {
        if (settledRef.current || abort.signal.aborted) {
          return;
        }
        handlers.onError(
          error instanceof Error
            ? error.message
            : "Lost connection to the run stream.",
        );
        cleanup();
      }
    },
    [cleanup],
  );

  return { startStreamingRun, cancel, cleanup };
}
