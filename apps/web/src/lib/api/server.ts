import "server-only";

import {
  analysisQuery,
  type ApiCardRow,
  prepareRequestBody,
  readErrorMessage,
  type WorkerVersion,
} from "./shared";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8080";

async function serverApiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    body: prepareRequestBody(init),
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
}

export async function fetchWorkerVersionServer(): Promise<WorkerVersion> {
  const response = await serverApiFetch("/version");
  return response.json();
}

export async function fetchCardsServer(): Promise<ApiCardRow[]> {
  const response = await serverApiFetch("/cards");
  return response.json();
}

export async function fetchDecksServer() {
  const response = await serverApiFetch("/decks");
  return response.json();
}

export async function fetchMaterialDecksServer() {
  const response = await serverApiFetch("/material-decks");
  return response.json();
}

export async function fetchRunHistoryServer(options?: {
  deckHash?: string;
  deckId?: string;
}) {
  const response = await serverApiFetch(
    `/analysis/history${analysisQuery({
      deck_hash: options?.deckHash,
      deck_id: options?.deckId,
    })}`,
  );
  return response.json();
}

export async function fetchVersionGroupsServer(options: {
  deckHash?: string;
  deckId?: string;
  simType?: string;
  kind?: "evaluate" | "optimize";
}) {
  const response = await serverApiFetch(
    `/analysis/groups${analysisQuery({
      deck_hash: options.deckHash,
      deck_id: options.deckId,
      sim_type: options.simType,
      kind: options.kind,
    })}`,
  );
  return response.json();
}
