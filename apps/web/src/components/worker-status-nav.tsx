"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { handProgressPercent } from "@/features/workbench/lib/progress-percent";
import { workbenchHref } from "@/features/workbench/routes";
import type { Tab } from "@/features/workbench/types";
import { useRunTracker } from "@/lib/runs/run-tracker";
import type { TrackedRun, WorkerState } from "@/lib/runs/types";
import { isLiveRunStatus } from "@/lib/runs/types";

const KIND_LABELS = {
  evaluate: "Deck damage",
  optimize: "Ratio lab",
} as const;

function statusLabel(workerState: WorkerState): string {
  if (workerState === "offline") {
    return "Offline";
  }
  if (workerState === "idle") {
    return "Idle";
  }
  if (workerState === "finished") {
    return "Finished";
  }
  if (workerState === "failed") {
    return "Failed";
  }
  return "Busy";
}

function runStatusLabel(run: TrackedRun): string {
  if (run.status === "queued") {
    return "Queued";
  }
  if (run.status === "running") {
    return "Running";
  }
  if (run.status === "complete") {
    return "Complete";
  }
  return run.status;
}

function targetTabForRun(run: TrackedRun): Tab {
  return run.kind === "optimize" ? "ratios" : "deck";
}

export function WorkerStatusNav({ activeDeckId }: { activeDeckId?: string }) {
  const router = useRouter();
  const {
    workerStateReady,
    workerState,
    queueSummary,
    maxConcurrency,
    runningCount,
    queuedCount,
    liveRuns,
    finishedRuns,
    cancelRun,
    dismissFinished,
    clearQueue,
  } = useRunTracker();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const statusText = workerStateReady
    ? workerState === "running"
      ? queueSummary
      : workerState === "finished"
        ? `${finishedRuns.length} finished`
        : statusLabel(workerState)
    : null;

  function navigateToRun(run: TrackedRun) {
    if (!run.deckId) {
      return;
    }
    const params = new URLSearchParams();
    params.set("run", run.id);
    router.push(
      workbenchHref(targetTabForRun(run), run.deckId || activeDeckId, params),
    );
    setOpen(false);
  }

  const queueItems = [...liveRuns].sort((a, b) => {
    if (a.status === b.status) {
      return a.deckName.localeCompare(b.deckName);
    }
    return a.status === "running" ? -1 : 1;
  });
  const hasQueueItems = queueItems.length > 0 || finishedRuns.length > 0;

  return (
    <div className="worker-status-nav" ref={rootRef}>
      <button
        type="button"
        className={[
          "worker-status-trigger",
          workerStateReady && workerState === "idle" ? "is-idle" : "",
          workerStateReady && workerState === "running" ? "is-running" : "",
          workerStateReady && workerState === "finished" ? "is-finished" : "",
          workerStateReady && workerState === "failed" ? "is-failed" : "",
          workerStateReady && workerState === "offline" ? "is-offline" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="worker-status-kicker">Worker</span>
        {statusText ? (
          <span className="worker-status-label">{statusText}</span>
        ) : null}
      </button>
      {open ? (
        <div className="worker-status-panel" role="dialog" aria-label="Worker status">
          {!workerStateReady ? (
            <p className="worker-status-meta">Checking worker state…</p>
          ) : workerState === "offline" ? (
            <>
              <p className="worker-status-panel-title">Offline</p>
              <p className="worker-status-meta">
                The API cannot reach the simulation worker. Runs cannot start
                until it is back.
              </p>
            </>
          ) : (
            <>
              <div className="worker-status-panel-head">
                <p className="worker-status-panel-title">
                  {workerState === "running"
                    ? queueSummary
                    : statusLabel(workerState)}
                </p>
                {hasQueueItems ? (
                  <button
                    type="button"
                    className="text-action worker-queue-clear"
                    onClick={() => {
                      void clearQueue();
                    }}
                  >
                    Clear queue
                  </button>
                ) : null}
              </div>
              {workerState === "running" ? (
                <p className="worker-status-meta">
                  {maxConcurrency} worker slot{maxConcurrency === 1 ? "" : "s"}{" "}
                  · {runningCount} active · {queuedCount} waiting
                </p>
              ) : null}

              {queueItems.length > 0 ? (
                <ul className="worker-queue-list">
                  {queueItems.map((run) => {
                    const percent =
                      run.status === "running" && run.progress
                        ? handProgressPercent(run.progress)
                        : null;
                    return (
                      <li className="worker-queue-item" key={run.id}>
                        <div className="worker-queue-item-head">
                          <strong>{KIND_LABELS[run.kind]}</strong>
                          <span>{runStatusLabel(run)}</span>
                        </div>
                        <p className="worker-queue-item-meta">{run.deckName}</p>
                        {percent != null ? (
                          <p className="worker-queue-item-progress">
                            {percent}% complete
                          </p>
                        ) : null}
                        <div className="worker-queue-item-actions">
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => navigateToRun(run)}
                          >
                            Open
                          </button>
                          {isLiveRunStatus(run.status) ? (
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => {
                                void cancelRun(run.id);
                              }}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : workerState === "idle" ? (
                <p className="worker-status-meta">No simulations in the queue.</p>
              ) : null}

              {finishedRuns.length > 0 ? (
                <>
                  <p className="worker-queue-section-label">Finished</p>
                  <ul className="worker-queue-list">
                    {finishedRuns.map((run) => (
                      <li className="worker-queue-item" key={run.id}>
                        <div className="worker-queue-item-head">
                          <strong>{KIND_LABELS[run.kind]}</strong>
                          <span>Complete</span>
                        </div>
                        <p className="worker-queue-item-meta">{run.deckName}</p>
                        <div className="worker-queue-item-actions">
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => navigateToRun(run)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => {
                              dismissFinished(run.id);
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
