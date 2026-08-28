"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createRun,
  deleteRun,
  fetchRun,
  fetchRunQueue,
  runEventsUrl,
} from "@/lib/api/client";
import type { DeckResult, RatioResult } from "@/features/workbench/types";
import {
  dispatchSseEvent,
  mergeOptimizeProgress,
  readSse,
  type OptimizeProgress,
} from "./sse";
import {
  hydrateDeckResult,
  hydrateRatioResult,
  type FetchRunResponse,
} from "./hydrate-result";
import {
  dismissAllRunIds,
  dismissRunId,
  loadDismissedRunIds,
} from "./storage";
import type {
  ActiveRunRow,
  QueueRunItem,
  RunKind,
  TrackedRun,
  WorkerState,
} from "./types";
import {
  aggregateWorkerState,
  isLiveRunStatus,
  queueSummaryLabel,
} from "./types";

interface RunTrackerContextValue {
  workerState: WorkerState;
  workerStateReady: boolean;
  workerReachable: boolean;
  maxConcurrency: number;
  runningCount: number;
  queuedCount: number;
  queueSummary: string;
  runs: TrackedRun[];
  liveRuns: TrackedRun[];
  finishedRuns: TrackedRun[];
  getRun: (runId: string) => TrackedRun | undefined;
  getRunForDeck: (
    deckId: string,
    kind: RunKind,
    preferredRunId?: string | null,
  ) => TrackedRun | null;
  startEvaluate: (
    deckId: string,
    deckName: string,
    payload: Record<string, unknown>,
    initialProgress: OptimizeProgress,
  ) => Promise<string>;
  startOptimize: (
    deckId: string,
    deckName: string,
    payload: Record<string, unknown>,
    initialProgress: OptimizeProgress,
  ) => Promise<string>;
  cancelRun: (runId: string) => Promise<void>;
  dismissFinished: (runId: string) => void;
  clearQueue: () => Promise<void>;
  syncFromServer: () => Promise<void>;
}

const RunTrackerContext = createContext<RunTrackerContextValue | null>(null);

function trackedRunFromItem(
  item: QueueRunItem,
  progress: OptimizeProgress | null = null,
  existing?: TrackedRun | null,
): TrackedRun {
  const row = item.run;
  return {
    id: row.id,
    kind: row.kind as RunKind,
    deckId: row.deck_id ?? "",
    deckName: item.deckName,
    status: row.status,
    progress: existing?.progress ?? progress,
    deckResult: existing?.deckResult ?? null,
    ratioResult: existing?.ratioResult ?? null,
    error: row.error_message ?? existing?.error ?? null,
  };
}

function initialProgressFromRow(row: ActiveRunRow): OptimizeProgress | null {
  if (row.kind === "evaluate") {
    const total = row.samples ?? 0;
    if (total <= 0) {
      return null;
    }
    return {
      decksScored: 0,
      totalDecks: 0,
      legalDecks: 0,
      handsSimulated: 0,
      totalHands: total,
      bestScore: 0,
      ...(row.rollouts != null && row.rollouts > 1
        ? { rolloutsDone: 0, totalRollouts: row.rollouts }
        : {}),
    };
  }
  if (row.kind === "optimize") {
    const totalDecks = row.decks_requested ?? 0;
    const totalHands = (row.samples ?? 0) * totalDecks;
    if (totalDecks <= 0) {
      return null;
    }
    return {
      decksScored: 0,
      totalDecks,
      legalDecks: 0,
      handsSimulated: 0,
      totalHands,
      bestScore: 0,
    };
  }
  return null;
}

function runsMapToArray(runs: Map<string, TrackedRun>): TrackedRun[] {
  return [...runs.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function RunTrackerProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<Map<string, TrackedRun>>(() => new Map());
  const [dismissedRunIds, setDismissedRunIds] = useState<Set<string>>(() =>
    loadDismissedRunIds(),
  );
  const [workerStateReady, setWorkerStateReady] = useState(false);
  const [workerReachable, setWorkerReachable] = useState(true);
  const [maxConcurrency, setMaxConcurrency] = useState(2);
  const [runningCount, setRunningCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);

  const streamsRef = useRef<Map<string, AbortController>>(new Map());
  const settledRef = useRef<Set<string>>(new Set());
  const syncingRef = useRef(false);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  const updateRun = useCallback(
    (runId: string, patch: (current: TrackedRun) => TrackedRun) => {
      setRuns((current) => {
        const existing = current.get(runId);
        if (!existing) {
          return current;
        }
        const next = new Map(current);
        next.set(runId, patch(existing));
        return next;
      });
    },
    [],
  );

  const detachStream = useCallback((runId: string) => {
    streamsRef.current.get(runId)?.abort();
    streamsRef.current.delete(runId);
  }, []);

  const applyComplete = useCallback(
    (runId: string, kind: RunKind, result: unknown) => {
      updateRun(runId, (current) => {
        if (kind === "evaluate") {
          return {
            ...current,
            status: "complete",
            deckResult: result as DeckResult,
            progress: current.progress
              ? {
                  ...current.progress,
                  handsSimulated: current.progress.totalHands,
                  rolloutsDone:
                    current.progress.totalRollouts ??
                    current.progress.rolloutsDone,
                }
              : current.progress,
          };
        }
        const ratio = result as RatioResult;
        return {
          ...current,
          status: "complete",
          ratioResult: ratio,
          progress: current.progress
            ? {
                ...current.progress,
                decksScored: current.progress.totalDecks,
                handsSimulated: current.progress.totalHands,
                bestScore: ratio.bestScore,
              }
            : current.progress,
        };
      });
    },
    [updateRun],
  );

  const attachStream = useCallback(
    (runId: string, kind: RunKind) => {
      if (streamsRef.current.has(runId)) {
        return;
      }

      const abort = new AbortController();
      streamsRef.current.set(runId, abort);

      void (async () => {
        try {
          const response = await fetch(runEventsUrl(runId), {
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
            const settled = dispatchSseEvent(data, {
              onProgress: (update) => {
                updateRun(runId, (current) => ({
                  ...current,
                  status: "running",
                  progress: mergeOptimizeProgress(current.progress, update),
                }));
              },
              onComplete: (result) => {
                settledRef.current.add(runId);
                applyComplete(runId, kind, result);
              },
              onError: (message) => {
                settledRef.current.add(runId);
                updateRun(runId, (current) => ({
                  ...current,
                  status: "failed",
                  error: message,
                }));
                detachStream(runId);
              },
            });
            if (settled) {
              detachStream(runId);
              return;
            }
          }
          if (!settledRef.current.has(runId) && !abort.signal.aborted) {
            updateRun(runId, (current) => ({
              ...current,
              status: "failed",
              error: "Lost connection to the run stream.",
            }));
            detachStream(runId);
          }
        } catch (error) {
          if (settledRef.current.has(runId) || abort.signal.aborted) {
            return;
          }
          updateRun(runId, (current) => ({
            ...current,
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Lost connection to the run stream.",
          }));
          detachStream(runId);
        }
      })();
    },
    [applyComplete, detachStream, updateRun],
  );

  const hydrateCompletedRun = useCallback(
    async (runId: string) => {
      const response = (await fetchRun(runId)) as FetchRunResponse;
      updateRun(runId, (current) => ({
        ...current,
        status: "complete",
        deckResult:
          current.kind === "evaluate" ? hydrateDeckResult(response) : null,
        ratioResult:
          current.kind === "optimize" ? hydrateRatioResult(response) : null,
      }));
    },
    [updateRun],
  );

  const syncFromServer = useCallback(async () => {
    if (syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    try {
      const queue = await fetchRunQueue();
      setWorkerReachable(queue.workerReachable);
      setMaxConcurrency(queue.maxConcurrency);
      setRunningCount(queue.running.length);
      setQueuedCount(queue.queued.length);

      const dismissed = loadDismissedRunIds();
      setDismissedRunIds(dismissed);

      setRuns((current) => {
        const next = new Map<string, TrackedRun>();
        for (const item of [...queue.running, ...queue.queued]) {
          const existing = current.get(item.run.id);
          next.set(
            item.run.id,
            trackedRunFromItem(
              item,
              existing?.progress ?? initialProgressFromRow(item.run),
              existing,
            ),
          );
        }
        for (const item of queue.finished) {
          if (dismissed.has(item.run.id)) {
            continue;
          }
          const existing = current.get(item.run.id);
          next.set(
            item.run.id,
            trackedRunFromItem(item, existing?.progress ?? null, existing),
          );
        }
        return next;
      });

      for (const item of [...queue.running, ...queue.queued]) {
        attachStream(item.run.id, item.run.kind as RunKind);
      }

      const liveIds = new Set(
        [...queue.running, ...queue.queued].map((item) => item.run.id),
      );
      for (const runId of [...streamsRef.current.keys()]) {
        if (!liveIds.has(runId)) {
          detachStream(runId);
        }
      }

      for (const item of queue.finished) {
        if (dismissed.has(item.run.id)) {
          continue;
        }
        const existing = runsRef.current.get(item.run.id);
        if (existing?.deckResult || existing?.ratioResult) {
          continue;
        }
        void hydrateCompletedRun(item.run.id);
      }
    } catch {
      // Browser cannot reach the API.
    } finally {
      syncingRef.current = false;
    }
  }, [attachStream, detachStream, hydrateCompletedRun]);

  useEffect(() => {
    let cancelled = false;
    void syncFromServer().finally(() => {
      if (!cancelled) {
        setWorkerStateReady(true);
      }
    });
    const onFocus = () => {
      void syncFromServer();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [syncFromServer]);

  useEffect(
    () => () => {
      for (const runId of streamsRef.current.keys()) {
        detachStream(runId);
      }
    },
    [detachStream],
  );

  useEffect(() => {
    if (runningCount + queuedCount === 0) {
      return;
    }
    const interval = window.setInterval(() => {
      void syncFromServer();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [queuedCount, runningCount, syncFromServer]);

  const startRun = useCallback(
    async (
      kind: RunKind,
      deckId: string,
      deckName: string,
      payload: Record<string, unknown>,
      initialProgress: OptimizeProgress,
    ) => {
      const { id } = await createRun(kind, payload, deckId);
      const tracked: TrackedRun = {
        id,
        kind,
        deckId,
        deckName,
        status: "queued",
        progress: initialProgress,
        deckResult: null,
        ratioResult: null,
        error: null,
      };
      setRuns((current) => {
        const next = new Map(current);
        next.set(id, tracked);
        return next;
      });
      attachStream(id, kind);
      void syncFromServer();
      return id;
    },
    [attachStream, syncFromServer],
  );

  const startEvaluate = useCallback(
    (
      deckId: string,
      deckName: string,
      payload: Record<string, unknown>,
      initialProgress: OptimizeProgress,
    ) => startRun("evaluate", deckId, deckName, payload, initialProgress),
    [startRun],
  );

  const startOptimize = useCallback(
    (
      deckId: string,
      deckName: string,
      payload: Record<string, unknown>,
      initialProgress: OptimizeProgress,
    ) => startRun("optimize", deckId, deckName, payload, initialProgress),
    [startRun],
  );

  const cancelRun = useCallback(
    async (runId: string) => {
      settledRef.current.add(runId);
      detachStream(runId);
      setRuns((current) => {
        const next = new Map(current);
        next.delete(runId);
        return next;
      });
      try {
        await deleteRun(runId);
      } catch {
        // Stream teardown is enough for UI.
      }
      void syncFromServer();
    },
    [detachStream, syncFromServer],
  );

  const dismissFinished = useCallback((runId: string) => {
    setDismissedRunIds((current) => dismissRunId(current, runId));
    setRuns((current) => {
      const next = new Map(current);
      next.delete(runId);
      return next;
    });
  }, []);

  const clearQueue = useCallback(async () => {
    const snapshot = runsMapToArray(runsRef.current);
    const live = snapshot.filter((run) => isLiveRunStatus(run.status));
    const finished = snapshot.filter((run) => run.status === "complete");

    await Promise.all(live.map((run) => cancelRun(run.id)));

    if (finished.length > 0) {
      setDismissedRunIds((current) =>
        dismissAllRunIds(
          current,
          finished.map((run) => run.id),
        ),
      );
      setRuns((current) => {
        const next = new Map(current);
        for (const run of finished) {
          next.delete(run.id);
        }
        return next;
      });
    }

    void syncFromServer();
  }, [cancelRun, syncFromServer]);

  const runsArray = useMemo(() => runsMapToArray(runs), [runs]);
  const liveRuns = useMemo(
    () => runsArray.filter((run) => isLiveRunStatus(run.status)),
    [runsArray],
  );
  const finishedRuns = useMemo(
    () =>
      runsArray.filter(
        (run) => run.status === "complete" && !dismissedRunIds.has(run.id),
      ),
    [dismissedRunIds, runsArray],
  );

  const getRun = useCallback(
    (runId: string) => runs.get(runId),
    [runs],
  );

  const getRunForDeck = useCallback(
    (deckId: string, kind: RunKind, preferredRunId?: string | null) => {
      const matches = runsArray.filter(
        (run) => run.deckId === deckId && run.kind === kind,
      );
      if (preferredRunId) {
        const preferred = matches.find((run) => run.id === preferredRunId);
        if (preferred) {
          return preferred;
        }
      }
      const live = matches.filter((run) => isLiveRunStatus(run.status));
      if (live.length > 0) {
        return live[live.length - 1] ?? null;
      }
      const complete = matches.filter((run) => run.status === "complete");
      if (complete.length > 0) {
        return complete[0] ?? null;
      }
      return null;
    },
    [runsArray],
  );

  const visibleFinishedCount = finishedRuns.length;
  const workerState = aggregateWorkerState(
    workerReachable,
    liveRuns.length,
    visibleFinishedCount,
  );
  const queueSummary = queueSummaryLabel(
    runningCount,
    queuedCount,
    maxConcurrency,
  );

  const value = useMemo(
    () => ({
      workerState,
      workerStateReady,
      workerReachable,
      maxConcurrency,
      runningCount,
      queuedCount,
      queueSummary,
      runs: runsArray,
      liveRuns,
      finishedRuns,
      getRun,
      getRunForDeck,
      startEvaluate,
      startOptimize,
      cancelRun,
      dismissFinished,
      clearQueue,
      syncFromServer,
    }),
    [
      workerState,
      workerStateReady,
      workerReachable,
      maxConcurrency,
      runningCount,
      queuedCount,
      queueSummary,
      runsArray,
      liveRuns,
      finishedRuns,
      getRun,
      getRunForDeck,
      startEvaluate,
      startOptimize,
      cancelRun,
      dismissFinished,
      clearQueue,
      syncFromServer,
    ],
  );

  return (
    <RunTrackerContext.Provider value={value}>
      {children}
    </RunTrackerContext.Provider>
  );
}

export function useRunTracker(): RunTrackerContextValue {
  const context = useContext(RunTrackerContext);
  if (!context) {
    throw new Error("useRunTracker must be used within RunTrackerProvider");
  }
  return context;
}
