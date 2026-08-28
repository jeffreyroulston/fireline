const DISMISSED_KEY = "fireline-dismissed-run-ids";
const LEGACY_DISMISSED_KEY = "fireline-dismissed-run-id";

export function loadDismissedRunIds(): Set<string> {
  if (typeof sessionStorage === "undefined") {
    return new Set();
  }
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (raw) {
      return new Set(JSON.parse(raw) as string[]);
    }
    const legacy = sessionStorage.getItem(LEGACY_DISMISSED_KEY);
    if (legacy) {
      const ids = new Set([legacy]);
      saveDismissedRunIds(ids);
      sessionStorage.removeItem(LEGACY_DISMISSED_KEY);
      return ids;
    }
  } catch {
    return new Set();
  }
  return new Set();
}

export function saveDismissedRunIds(ids: Set<string>): void {
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

export function dismissRunId(ids: Set<string>, runId: string): Set<string> {
  const next = new Set(ids);
  next.add(runId);
  saveDismissedRunIds(next);
  return next;
}

export function dismissAllRunIds(
  ids: Set<string>,
  runIds: Iterable<string>,
): Set<string> {
  const next = new Set(ids);
  for (const runId of runIds) {
    next.add(runId);
  }
  saveDismissedRunIds(next);
  return next;
}

export function clearDismissedRunIds(): void {
  sessionStorage.removeItem(DISMISSED_KEY);
  sessionStorage.removeItem(LEGACY_DISMISSED_KEY);
}
