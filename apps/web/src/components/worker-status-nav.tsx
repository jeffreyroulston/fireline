"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { handProgressPercent } from "@/features/workbench/lib/progress-percent";
import { workbenchHref } from "@/features/workbench/routes";
import type { Tab } from "@/features/workbench/types";
import { useRunTracker } from "@/lib/runs/run-tracker";
import type { TrackedRun, WorkerState } from "@/lib/runs/types";
import { isLiveRunStatus } from "@/lib/runs/types";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/lib/utils/variants";
import { StatusBadge } from "@/components/status-badge";

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
    saveRun,
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
      { scroll: false },
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
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(
          "flex min-w-[140px] cursor-pointer flex-col gap-0.5 border-0 bg-transparent py-1 text-right font-mono text-muted",
          workerStateReady && workerState === "running" && "text-foreground",
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-[9px] tracking-[0.12em] uppercase">Worker</span>
        {statusText ? (
          <span
            className={cn(
              "text-[11px] uppercase",
              workerStateReady &&
                workerState === "idle" &&
                "text-secondary",
              workerStateReady &&
                workerState === "running" &&
                "text-primary",
              workerStateReady &&
                (workerState === "finished" || workerState === "failed") &&
                "text-foreground",
              workerStateReady &&
                workerState === "offline" &&
                "text-muted",
            )}
          >
            {statusText}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="absolute top-[calc(100%+6px)] right-0 z-30 w-[min(320px,90vw)] border border-border bg-surface-muted px-4 py-3.5 shadow-[0_10px_28px_rgb(0_0_0_/_12%)]"
          role="dialog"
          aria-label="Worker status"
        >
          {!workerStateReady ? (
            <p className="mb-2 font-mono text-[11px] text-muted">
              Checking worker state…
            </p>
          ) : workerState === "offline" ? (
            <>
              <p className="m-0 font-display text-lg tracking-[0.04em] uppercase">
                Offline
              </p>
              <p className="mb-2 font-mono text-[11px] text-muted">
                The API cannot reach the simulation worker. Runs cannot start
                until it is back.
              </p>
            </>
          ) : (
            <>
              <div className="mb-1.5 flex items-start justify-between gap-3">
                <p className="m-0 font-display text-lg tracking-[0.04em] uppercase">
                  {workerState === "running"
                    ? queueSummary
                    : statusLabel(workerState)}
                </p>
                {hasQueueItems ? (
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ intent: "text" }),
                      "mt-0.5 shrink-0",
                    )}
                    onClick={() => {
                      void clearQueue();
                    }}
                  >
                    Clear queue
                  </button>
                ) : null}
              </div>
              {workerState === "running" ? (
                <p className="mb-2 font-mono text-[11px] text-muted">
                  {maxConcurrency} worker slot{maxConcurrency === 1 ? "" : "s"}{" "}
                  · {runningCount} active · {queuedCount} waiting
                </p>
              ) : null}

              {queueItems.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {queueItems.map((run) => {
                    const percent =
                      run.status === "running" && run.progress
                        ? handProgressPercent(run.progress)
                        : null;
                    return (
                      <li
                        className="[&:not(:first-child)]:mt-2.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border [&:not(:first-child)]:pt-2.5"
                        key={run.id}
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-2.5 font-display text-[15px] tracking-[0.03em] uppercase">
                          <strong>{KIND_LABELS[run.kind]}</strong>
                          <StatusBadge status={run.status} />
                        </div>
                        <p className="mb-1.5 font-mono text-[11px] text-muted">
                          {run.deckName}
                        </p>
                        {percent != null ? (
                          <p className="mb-1.5 font-mono text-[11px] text-muted">
                            {percent}% complete
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-x-3.5 gap-y-2.5">
                          <button
                            type="button"
                            className={buttonVariants({ intent: "text" })}
                            onClick={() => navigateToRun(run)}
                          >
                            Open
                          </button>
                          {isLiveRunStatus(run.status) ? (
                            <>
                              <button
                                type="button"
                                className={buttonVariants({ intent: "text" })}
                                onClick={() => {
                                  void cancelRun(run.id);
                                }}
                              >
                                Cancel
                              </button>
                              {run.status === "running" ? (
                                <button
                                  type="button"
                                  className={buttonVariants({ intent: "text" })}
                                  onClick={() => {
                                    void saveRun(run.id);
                                  }}
                                >
                                  Cancel & save
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : workerState === "idle" ? (
                <p className="mb-2 font-mono text-[11px] text-muted">
                  No simulations in the queue.
                </p>
              ) : null}

              {finishedRuns.length > 0 ? (
                <>
                  <p className="mt-3.5 mb-1.5 font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
                    Finished
                  </p>
                  <ul className="m-0 list-none p-0">
                    {finishedRuns.map((run) => (
                      <li
                        className="[&:not(:first-child)]:mt-2.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border [&:not(:first-child)]:pt-2.5"
                        key={run.id}
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-2.5 font-display text-[15px] tracking-[0.03em] uppercase">
                          <strong>{KIND_LABELS[run.kind]}</strong>
                          <StatusBadge
                            status={run.status}
                            errorMessage={run.error}
                          />
                        </div>
                        <p className="mb-1.5 font-mono text-[11px] text-muted">
                          {run.deckName}
                        </p>
                        <div className="flex flex-wrap gap-x-3.5 gap-y-2.5">
                          <button
                            type="button"
                            className={buttonVariants({ intent: "text" })}
                            onClick={() => navigateToRun(run)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className={buttonVariants({ intent: "text" })}
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
