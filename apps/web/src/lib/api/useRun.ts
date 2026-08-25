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
}

type RunKind = "evaluate" | "optimize";

interface StreamHandlers {
  onProgress: (progress: OptimizeProgress) => void;
  onComplete: (result: unknown) => void;
  onError: (message: string) => void;
}

function isOptimizeProgress(data: Record<string, unknown>): boolean {
  return typeof data.decksScored === "number";
}

export function useRun() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const runIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    runIdRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const cancel = useCallback(async () => {
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
      deckId: string | undefined,
      handlers: StreamHandlers,
    ) => {
      cleanup();
      const { id } = await createRun(kind, payload, deckId);
      runIdRef.current = id;

      const eventSource = new EventSource(runEventsUrl(id));
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        if (data.type === "progress" && isOptimizeProgress(data)) {
          handlers.onProgress(data as unknown as OptimizeProgress);
          return;
        }
        if (data.type === "complete") {
          handlers.onComplete(data.result);
          cleanup();
          return;
        }
        if (data.type === "error") {
          handlers.onError(
            typeof data.message === "string" ? data.message : "Run failed.",
          );
          cleanup();
          return;
        }
        if (data.type === "cancelled") {
          handlers.onError("Calculation cancelled.");
          cleanup();
        }
      };

      eventSource.onerror = () => {
        handlers.onError("Lost connection to the run stream.");
        cleanup();
      };
    },
    [cleanup],
  );

  return { startStreamingRun, cancel, cleanup };
}
