export async function* readNdjson<T>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
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

export type SolveStreamEvent =
  | { kind: "heartbeat" }
  | { kind: "memoryPressure"; level: "clear" | "squeeze" | "parked" }
  | { kind: "error"; message: string }
  | ({ kind: "result" } & Record<string, unknown>);

export async function consumeSolveStream<T extends Record<string, unknown>>(
  body: ReadableStream<Uint8Array>,
): Promise<T> {
  for await (const event of readNdjson<SolveStreamEvent>(body)) {
    if (event.kind === "error") {
      throw new Error(event.message);
    }
    if (event.kind === "result") {
      const result = { ...event } as Record<string, unknown>;
      delete result.kind;
      return result as T;
    }
  }
  throw new Error("Solve stream ended without a result");
}
