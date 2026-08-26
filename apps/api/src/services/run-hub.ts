type Subscriber = (event: unknown) => void;

interface ActiveRun {
  abort: AbortController;
  subscribers: Set<Subscriber>;
  buffer: unknown[];
  terminal: boolean;
}

function isTerminalEvent(event: unknown): boolean {
  if (!event || typeof event !== "object") {
    return false;
  }
  const type = (event as { type?: unknown }).type;
  return type === "complete" || type === "error" || type === "cancelled";
}

export function sseJson(event: unknown): string {
  return JSON.stringify(event, (_key, value) =>
    typeof value === "bigint" ? Number(value) : value,
  );
}

export class RunHub {
  private readonly active = new Map<string, ActiveRun>();

  register(runId: string): AbortController {
    const existing = this.active.get(runId);
    if (existing) {
      return existing.abort;
    }
    const abort = new AbortController();
    this.active.set(runId, {
      abort,
      subscribers: new Set(),
      buffer: [],
      terminal: false,
    });
    return abort;
  }

  getAbort(runId: string): AbortController | undefined {
    return this.active.get(runId)?.abort;
  }

  publish(runId: string, event: unknown): void {
    const entry = this.active.get(runId);
    if (!entry) {
      return;
    }
    entry.buffer.push(event);
    if (isTerminalEvent(event)) {
      entry.terminal = true;
    }
    for (const subscriber of entry.subscribers) {
      subscriber(event);
    }
  }

  subscribe(runId: string, send: Subscriber): () => void {
    const entry = this.active.get(runId) ?? this.registerAndGet(runId);
    entry.subscribers.add(send);
    for (const event of entry.buffer) {
      send(event);
    }
    return () => {
      entry.subscribers.delete(send);
    };
  }

  close(runId: string): void {
    const entry = this.active.get(runId);
    if (!entry) {
      return;
    }
    setTimeout(() => {
      if (this.active.get(runId) === entry) {
        this.active.delete(runId);
      }
    }, 120_000);
  }

  private registerAndGet(runId: string): ActiveRun {
    this.register(runId);
    const entry = this.active.get(runId);
    if (!entry) {
      throw new Error("run hub register failed");
    }
    return entry;
  }
}

export const runHub = new RunHub();
