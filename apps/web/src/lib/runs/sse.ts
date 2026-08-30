import type {
  HandPhase,
  HandProgress,
  MemoryPressureLevel,
  OptimizeProgress,
} from "./types";

export type { OptimizeProgress };

export interface StreamHandlers {
  onProgress: (progress: OptimizeProgress) => void;
  onHandProgress?: (hand: HandProgress) => void;
  onMemoryPressure?: (level: MemoryPressureLevel | null) => void;
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

function asHandPhase(value: unknown): HandPhase | null {
  if (
    value === "started" ||
    value === "throttled" ||
    value === "rollout" ||
    value === "done"
  ) {
    return value;
  }
  return null;
}

function asMemoryPressure(value: unknown): MemoryPressureLevel | null {
  if (value === "squeeze" || value === "parked") {
    return value;
  }
  return null;
}

export function coerceHandProgress(
  data: Record<string, unknown>,
): HandProgress | null {
  const sampleIndex =
    asNumber(data.sampleIndex) ?? asNumber(data.sample_index);
  const phase = asHandPhase(data.phase);
  const rollout = asNumber(data.rollout);
  const totalRollouts =
    asNumber(data.totalRollouts) ?? asNumber(data.total_rollouts);
  if (
    sampleIndex == null ||
    phase == null ||
    rollout == null ||
    totalRollouts == null
  ) {
    return null;
  }
  return {
    sampleIndex,
    phase,
    rolloutsDone: rollout,
    totalRollouts,
  };
}

export function applyHandProgress(
  current: HandProgress[] | undefined,
  update: HandProgress,
): HandProgress[] {
  const hands = current ?? [];
  if (update.phase === "done") {
    return hands.filter((hand) => hand.sampleIndex !== update.sampleIndex);
  }
  const index = hands.findIndex(
    (hand) => hand.sampleIndex === update.sampleIndex,
  );
  const startedAtMs =
    index >= 0 ? (hands[index].startedAtMs ?? Date.now()) : Date.now();
  const nextHand: HandProgress = { ...update, startedAtMs };
  if (index < 0) {
    return [...hands, nextHand].sort((a, b) => a.sampleIndex - b.sampleIndex);
  }
  const next = hands.slice();
  next[index] = nextHand;
  return next;
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
    ...current,
    ...update,
    totalRollouts: update.totalRollouts ?? current?.totalRollouts,
    hands: update.hands ?? current?.hands,
    started: true,
  };
}

export async function* readSse(
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

export function dispatchSseEvent(
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
  if (data.type === "handProgress") {
    const hand = coerceHandProgress(data);
    if (hand) {
      handlers.onHandProgress?.(hand);
    }
    return false;
  }
  if (data.type === "memoryPressure") {
    if (data.level === "clear") {
      handlers.onMemoryPressure?.(null);
    } else {
      const level = asMemoryPressure(data.level);
      if (level) {
        handlers.onMemoryPressure?.(level);
      }
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
