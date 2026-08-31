import type { CardDef } from "@ga-fire/contracts";

export function workerUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function fetchWorkerJson<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(workerUrl(base, path), init);
  if (!response.ok) {
    const body = await response.text();
    throw new WorkerError(response.status, body || response.statusText);
  }
  return (await response.json()) as T;
}

export class WorkerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

export async function loadCardCatalog(workerBase: string): Promise<CardDef[]> {
  return fetchWorkerJson<CardDef[]>(workerBase, "/cards");
}

export async function checkWorkerReachable(workerBase: string): Promise<boolean> {
  const health = await fetchWorkerHealth(workerBase);
  return health?.ok ?? false;
}

export async function fetchWorkerHealth(
  workerBase: string,
): Promise<{ ok: boolean; cpuCount: number } | null> {
  try {
    const response = await fetch(workerUrl(workerBase, "/health"), {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { ok?: boolean; cpuCount?: number };
    if (typeof body.ok !== "boolean") {
      return { ok: true, cpuCount: 1 };
    }
    return {
      ok: body.ok,
      cpuCount:
        typeof body.cpuCount === "number" && body.cpuCount > 0
          ? body.cpuCount
          : 1,
    };
  } catch {
    return null;
  }
}

export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        yield JSON.parse(line) as T;
      }
      newline = buffer.indexOf("\n");
    }
  }
  const tail = buffer.trim();
  if (tail) {
    yield JSON.parse(tail) as T;
  }
}

export async function postWorkerNdjson<T>(
  workerBase: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<{ response: Response; lines: AsyncGenerator<T> }> {
  const response = await fetch(workerUrl(workerBase, path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new WorkerError(response.status, text || response.statusText);
  }
  return { response, lines: readNdjson<T>(response.body) };
}
