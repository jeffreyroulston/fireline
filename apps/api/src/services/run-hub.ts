export type RunProgress =
  | { type: "evaluate"; sample: number; total: number }
  | { type: "optimize"; progress: Record<string, unknown> };

type Subscriber = (event: unknown) => void;

interface ActiveRun {
  abort: AbortController;
  subscribers: Set<Subscriber>;
}

export class RunHub {
  private readonly active = new Map<string, ActiveRun>();

  register(runId: string): AbortController {
    const abort = new AbortController();
    this.active.set(runId, { abort, subscribers: new Set() });
    return abort;
  }

  getAbort(runId: string): AbortController | undefined {
    return this.active.get(runId)?.abort;
  }

  publish(runId: string, event: unknown): void {
    for (const subscriber of this.active.get(runId)?.subscribers ?? []) {
      subscriber(event);
    }
  }

  subscribe(runId: string, send: Subscriber): () => void {
    const entry = this.active.get(runId);
    if (!entry) {
      return () => undefined;
    }
    entry.subscribers.add(send);
    return () => entry.subscribers.delete(send);
  }

  close(runId: string): void {
    this.active.delete(runId);
  }
}

export const runHub = new RunHub();
