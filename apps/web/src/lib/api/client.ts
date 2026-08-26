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

export async function solve(
  request: SolveRequest,
): Promise<SolveResult & { sampleId?: string | null }> {
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

export interface RunHistoryRow {
  id: string;
  kind: string;
  status: string;
  simType: string | null;
  deckHash: string | null;
  deckId: string | null;
  deckName: string | null;
  rootSeed: string | null;
  samples: number | null;
  meanDamage: number | null;
  p50Damage: number | null;
  bestScore: number | null;
  rulesVersion: number | null;
  samplerVersion: number | null;
  attributionVersion: number | null;
  cardDigest: string | null;
  build: string | null;
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number | null;
}

export interface VersionGroup {
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
  attributionVersion: number | null;
  runCount: number;
}

export interface PooledRunSamples {
  id: string;
  startedAt: string;
  samples: number | null;
  meanDamage: number | null;
  damages: number[];
}

export interface PooledDamageResponse {
  runCount: number;
  distribution: {
    totalSamples: number;
    mean: number;
    p50: number;
    p90: number;
    min: number;
    max: number;
    buckets: number[];
  } | null;
  runs?: PooledRunSamples[];
}

export interface CardLeaderboardResponse {
  runCount: number;
  totalSamples: number;
  cards: Array<{
    cardId: string;
    deckCopies: number;
    seeRate: number;
    playWhenInHand: number;
    damageWhenSeen: number;
    damageShare: number;
  }>;
}

export interface PooledSampleHighlight {
  runId: string;
  sampleIndex: number;
  inHand: string[];
  played: string[];
}

export interface PooledSampleHighlightsResponse {
  samples: PooledSampleHighlight[];
}

export interface RankedCandidatesResponse {
  candidates: Array<{
    rank: number;
    deckHash: string;
    appearances: number;
    wins: number;
    avgScore: number;
    bestScore: number;
  }>;
}

function analysisQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function fetchRunHistory(options?: {
  deckHash?: string;
  deckId?: string;
}) {
  const response = await apiFetch(
    `/analysis/history${analysisQuery({
      deck_hash: options?.deckHash,
      deck_id: options?.deckId,
    })}`,
  );
  return response.json() as Promise<RunHistoryRow[]>;
}

export async function fetchVersionGroups(options: {
  deckHash?: string;
  deckId?: string;
  simType?: string;
  kind?: "evaluate" | "optimize";
}) {
  const response = await apiFetch(
    `/analysis/groups${analysisQuery({
      deck_hash: options.deckHash,
      deck_id: options.deckId,
      sim_type: options.simType,
      kind: options.kind,
    })}`,
  );
  return response.json() as Promise<VersionGroup[]>;
}

export async function fetchPooledDamage(options: {
  deckHash: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
}) {
  const response = await apiFetch(
    `/analysis/pooled-damage${analysisQuery({
      deck_hash: options.deckHash,
      sim_type: options.simType,
      rules_version: options.rulesVersion,
      sampler_version: options.samplerVersion,
      card_digest: options.cardDigest,
    })}`,
  );
  return response.json() as Promise<PooledDamageResponse>;
}

export async function fetchCardLeaderboard(options: {
  deckHash: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
  attributionVersion: number;
}) {
  const response = await apiFetch(
    `/analysis/card-leaderboard${analysisQuery({
      deck_hash: options.deckHash,
      sim_type: options.simType,
      rules_version: options.rulesVersion,
      sampler_version: options.samplerVersion,
      card_digest: options.cardDigest,
      attribution_version: options.attributionVersion,
    })}`,
  );
  return response.json() as Promise<CardLeaderboardResponse>;
}

export interface PooledSampleResponse {
  runId: string;
  sampleId: string | null;
  sampleIndex: number;
  simType: string | null;
  hand: string[];
  damage: number;
  nodes: number;
  steps: Array<Record<string, unknown>>;
}

export async function fetchPooledSampleHighlights(options: {
  deckHash: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
}) {
  const response = await apiFetch(
    `/analysis/pooled-sample-highlights${analysisQuery({
      deck_hash: options.deckHash,
      sim_type: options.simType,
      rules_version: options.rulesVersion,
      sampler_version: options.samplerVersion,
      card_digest: options.cardDigest,
    })}`,
  );
  return response.json() as Promise<PooledSampleHighlightsResponse>;
}

export async function fetchPooledSample(options: {
  runId: string;
  sampleIndex: number;
}) {
  const response = await apiFetch(
    `/analysis/pooled-sample${analysisQuery({
      run_id: options.runId,
      sample_index: options.sampleIndex,
    })}`,
  );
  return response.json() as Promise<PooledSampleResponse>;
}

export async function fetchRankedCandidates(options: {
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
}) {
  const response = await apiFetch(
    `/analysis/candidates${analysisQuery({
      rules_version: options.rulesVersion,
      sampler_version: options.samplerVersion,
      card_digest: options.cardDigest,
    })}`,
  );
  return response.json() as Promise<RankedCandidatesResponse>;
}
