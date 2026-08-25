import type { SolveRequest, SolveResult } from "@ga-fire/contracts";

const API_PREFIX = "/api";

async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  if (!body) {
    return `Request failed (${response.status})`;
  }
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? body;
  } catch {
    return body;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const body =
    init?.body && typeof init.body === "string"
      ? JSON.stringify(JSON.parse(init.body), (_key, value) =>
          typeof value === "bigint" ? Number(value) : value,
        )
      : init?.body;

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    body,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
}

export async function fetchCards() {
  const response = await apiFetch("/cards");
  return response.json();
}

export async function solve(request: SolveRequest): Promise<SolveResult> {
  const response = await apiFetch("/solve", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function fetchDecks() {
  const response = await apiFetch("/decks");
  return response.json();
}

export async function createDeckOnApi(name: string, text: string) {
  const response = await apiFetch("/decks", {
    method: "POST",
    body: JSON.stringify({ name, text }),
  });
  return response.json();
}

export async function updateDeckOnApi(
  id: string,
  patch: { name?: string; text?: string },
) {
  const response = await apiFetch(`/decks/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return response.json();
}

export async function deleteDeckOnApi(id: string): Promise<void> {
  await apiFetch(`/decks/${id}`, { method: "DELETE" });
}

export async function createRun(
  kind: "evaluate" | "optimize",
  payload: Record<string, unknown>,
  deckId?: string,
): Promise<{ id: string; status: string }> {
  const response = await apiFetch("/runs", {
    method: "POST",
    body: JSON.stringify({ kind, deckId, payload }),
  });
  return response.json();
}

export async function deleteRun(id: string): Promise<void> {
  await apiFetch(`/runs/${id}`, { method: "DELETE" });
}

export function runEventsUrl(runId: string): string {
  return `${API_PREFIX}/runs/${runId}/events`;
}
