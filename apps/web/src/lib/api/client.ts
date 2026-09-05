import type {
  LineEvent,
  PlaytestApplyRequest,
  PlaytestApplyResult,
  PlaytestInitRequest,
  PlaytestInitResult,
  PlaytestLegalActionsRequest,
  PlaytestLegalActionsResult,
  SolveRequest,
  SolveResult,
} from "@ga-fire/contracts";
import {
  analysisQuery,
  appendRunSettingsFilter,
  prepareRequestBody,
  readErrorMessage,
  type ApiCardRow,
  type RunSettingsFilter,
  type WorkerVersion,
} from "./shared";
import { consumeSolveStream } from "./ndjson";

export type { ApiCardRow, RunSettingsFilter, WorkerVersion } from "./shared";

/** Must include next.config basePath so rewrites match `/solver/api/*`. */
const API_PREFIX = "/solver/api";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    body: prepareRequestBody(init),
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

export async function fetchWorkerVersion(): Promise<WorkerVersion> {
  const response = await apiFetch("/version");
  return response.json();
}

export async function fetchCards(): Promise<ApiCardRow[]> {
  const response = await apiFetch("/cards");
  return response.json();
}

export async function solve(
  request: SolveRequest,
  options?: { signal?: AbortSignal },
): Promise<SolveResult & { sampleId?: string | null }> {
  const response = await apiFetch("/solve", {
    method: "POST",
    body: JSON.stringify(request, (_key, value) =>
      typeof value === "bigint" ? Number(value) : value,
    ),
    signal: options?.signal,
  });
  if (!response.body) {
    throw new Error("Solve response had no body");
  }
  return consumeSolveStream<SolveResult & { sampleId?: string | null }>(
    response.body,
  );
}

export async function playtestInit(
  request: PlaytestInitRequest,
): Promise<PlaytestInitResult> {
  const response = await apiFetch("/game/v1/init", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function playtestLegalActions(
  request: PlaytestLegalActionsRequest,
): Promise<PlaytestLegalActionsResult> {
  const response = await apiFetch("/game/v1/legal", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function playtestApply(
  request: PlaytestApplyRequest,
): Promise<PlaytestApplyResult> {
  const response = await apiFetch("/game/v1/apply", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function fetchDecks() {
  const response = await apiFetch("/decks");
  return response.json();
}

export async function createDeckOnApi(
  name: string,
  text: string,
  materialDeckId?: string,
) {
  const response = await apiFetch("/decks", {
    method: "POST",
    body: JSON.stringify({ name, text, materialDeckId }),
  });
  return response.json();
}

export async function updateDeckOnApi(
  id: string,
  patch: { name?: string; text?: string; materialDeckId?: string },
) {
  const response = await apiFetch(`/decks/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: patch.name,
      text: patch.text,
      materialDeckId: patch.materialDeckId,
    }),
  });
  return response.json();
}

export async function fetchMaterialDecks() {
  const response = await apiFetch("/material-decks");
  return response.json();
}

export async function createMaterialDeckOnApi(name: string, text: string) {
  const response = await apiFetch("/material-decks", {
    method: "POST",
    body: JSON.stringify({ name, text }),
  });
  return response.json();
}

export async function updateMaterialDeckOnApi(
  id: string,
  patch: { name?: string },
) {
  const response = await apiFetch(`/material-decks/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return response.json();
}

export async function deleteMaterialDeckOnApi(id: string): Promise<void> {
  const response = await fetch(`${API_PREFIX}/material-decks/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    let parsed: { error?: string; linkedDecks?: Array<{ id: string; name: string; locked: boolean }> } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      // keep default
    }
    const error = new Error(
      parsed.error ?? (body || `Request failed (${response.status})`),
    ) as Error & {
      linkedDecks?: Array<{ id: string; name: string; locked: boolean }>;
    };
    error.linkedDecks = parsed.linkedDecks;
    throw error;
  }
}

export async function deleteDeckOnApi(id: string): Promise<void> {
  await apiFetch(`/decks/${id}`, { method: "DELETE" });
}

export async function createRun(
  kind: "evaluate" | "optimize",
  payload: Record<string, unknown>,
  deckId: string,
): Promise<{ id: string; status: string }> {
  const response = await apiFetch("/runs", {
    method: "POST",
    body: JSON.stringify({ kind, deckId, payload }),
  });
  return response.json();
}

export interface ActiveRunApiRow {
  id: string;
  kind: string;
  status: string;
  deck_id: string | null;
  sim_type: string | null;
  samples: number | null;
  rollouts: number | null;
  decks_requested: number | null;
  error_message: string | null;
  mean_damage: number | null;
  p50_damage: number | null;
  p90_damage: number | null;
  best_score: number | null;
  completed_at: string | null;
}

export async function fetchRunQueue(): Promise<{
  workerReachable: boolean;
  cpuCount: number;
  maxConcurrency: number;
  running: Array<{ run: ActiveRunApiRow; deckName: string }>;
  queued: Array<{ run: ActiveRunApiRow; deckName: string }>;
  finished: Array<{ run: ActiveRunApiRow; deckName: string }>;
}> {
  const response = await apiFetch("/runs/queue");
  return response.json();
}

/** @deprecated Use fetchRunQueue */
export async function fetchActiveRun(): Promise<{
  run: ActiveRunApiRow | null;
  deckName: string | null;
  workerReachable: boolean;
}> {
  const response = await apiFetch("/runs/active");
  return response.json();
}

export async function fetchRun(id: string): Promise<unknown> {
  const response = await apiFetch(`/runs/${id}`);
  return response.json();
}

export async function deleteRun(id: string): Promise<void> {
  await apiFetch(`/runs/${id}`, { method: "DELETE" });
}

export async function saveRun(id: string): Promise<{ discarded: boolean }> {
  const response = await apiFetch(`/runs/${id}/save`, { method: "POST" });
  return { discarded: response.status === 204 };
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
  rollouts: number | null;
  goFirst: boolean | null;
  maxTurns: number | null;
  metric: string | null;
  optimizeStrategy: string | null;
  maxThreads: number | null;
  glimpseEnabled: boolean | null;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
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
  errorMessage: string | null;
}

export interface VersionGroup {
  rulesVersion: number;
  samplerVersion: number;
  attributionVersion: number | null;
  runCount: number;
}

export interface PooledRunSamples {
  id: string;
  startedAt: string;
  samples: number | null;
  meanDamage: number | null;
  damages?: number[];
  samplePoints?: Array<{ index: number; damage: number }>;
}

export interface PooledDamageResponse {
  runCount: number;
  distribution: {
    totalSamples: number;
    mean: number;
    p10: number;
    p50: number;
    p90: number;
    min: number;
    max: number;
    meanEndInfluence: number | null;
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
    handLift: number | null;
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
    counts: Record<string, number>;
    appearances: number;
    wins: number;
    avgScore: number;
    bestScore: number;
  }>;
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
  runSettings?: RunSettingsFilter;
}) {
  const search = new URLSearchParams();
  if (options.deckHash) search.set("deck_hash", options.deckHash);
  if (options.deckId) search.set("deck_id", options.deckId);
  if (options.simType) search.set("sim_type", options.simType);
  if (options.kind) search.set("kind", options.kind);
  appendRunSettingsFilter(search, options.runSettings);
  const query = search.toString();
  const response = await apiFetch(
    `/analysis/groups${query ? `?${query}` : ""}`,
  );
  return response.json() as Promise<VersionGroup[]>;
}

export async function fetchPooledDamage(options: {
  deckHash?: string;
  deckId?: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  runSettings?: RunSettingsFilter;
}) {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
  });
  if (options.deckId) search.set("deck_id", options.deckId);
  else if (options.deckHash) search.set("deck_hash", options.deckHash);
  appendRunSettingsFilter(search, options.runSettings);
  const response = await apiFetch(`/analysis/pooled-damage?${search}`);
  return response.json() as Promise<PooledDamageResponse>;
}

export async function fetchCardLeaderboard(options: {
  deckHash?: string;
  deckId?: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  attributionVersion: number;
  damageGt?: number;
  damageGte?: number;
  damageLt?: number;
  damageLte?: number;
  runSettings?: RunSettingsFilter;
}) {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    attribution_version: String(options.attributionVersion),
  });
  if (options.deckId) search.set("deck_id", options.deckId);
  else if (options.deckHash) search.set("deck_hash", options.deckHash);
  if (options.damageGt != null) search.set("damage_gt", String(options.damageGt));
  if (options.damageGte != null) search.set("damage_gte", String(options.damageGte));
  if (options.damageLt != null) search.set("damage_lt", String(options.damageLt));
  if (options.damageLte != null) search.set("damage_lte", String(options.damageLte));
  appendRunSettingsFilter(search, options.runSettings);
  const response = await apiFetch(`/analysis/card-leaderboard?${search}`);
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
  events: LineEvent[];
}

export async function fetchPooledSampleHighlights(options: {
  deckHash?: string;
  deckId?: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  runSettings?: RunSettingsFilter;
}) {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
  });
  if (options.deckId) search.set("deck_id", options.deckId);
  else if (options.deckHash) search.set("deck_hash", options.deckHash);
  appendRunSettingsFilter(search, options.runSettings);
  const response = await apiFetch(
    `/analysis/pooled-sample-highlights?${search}`,
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
  deckId?: string;
  deckHash?: string;
}) {
  const response = await apiFetch(
    `/analysis/candidates${analysisQuery({
      rules_version: options.rulesVersion,
      sampler_version: options.samplerVersion,
      deck_id: options.deckId,
      deck_hash: options.deckHash,
    })}`,
  );
  return response.json() as Promise<RankedCandidatesResponse>;
}

export type CardDatabasePerformance = {
  runCount: number;
  deckCount: number;
  eligibleSamples: number;
  opened: number;
  openedCopies: number;
  drawn: number;
  seen: number;
  plays: number;
  attacks: number;
  damage: number;
  openRate: number;
  seeRate: number;
  playWhenInHand: number;
  damageWhenSeen: number;
  withHandMean: number | null;
  withoutHandMean: number | null;
  handLift: number | null;
  withHandSamples: number;
  withoutHandSamples: number;
};

export type CardDatabaseCard = {
  id: string;
  name: string;
  short: string;
  kind: string;
  cost: number;
  element: string;
  power?: number | null;
  life?: number | null;
  stealth?: boolean;
  unique?: boolean;
  assassinPowerBonus?: number | null;
  assassinStealth?: boolean;
  automaton?: boolean;
  fast?: boolean;
  floatingMemory?: boolean;
  kindle?: number | null;
  prepare?: number | null;
  aliases?: string[];
  performance: CardDatabasePerformance | null;
  hasOlderData: boolean;
};

export type CardDatabaseContributor = {
  deckId: string;
  name: string;
  runCount: number;
  samples: number;
  sampleShare: number;
};

export type CardDatabaseResponse = {
  simType: string;
  version: {
    rulesVersion: number;
    samplerVersion: number;
  };
  attributionVersion: number;
  currentVersion: {
    rulesVersion: number;
    samplerVersion: number;
  };
  currentAttributionVersion: number;
  totalRuns: number;
  totalSamples: number;
  contributors: CardDatabaseContributor[];
  cards: CardDatabaseCard[];
  availableRunSettings: {
    goFirst: boolean[];
    maxTurns: number[];
  };
};

export type CardDatabaseSource = "all" | "evaluate" | "swap_sweep";

export async function fetchCardDatabase(options: {
  source?: CardDatabaseSource;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  attributionVersion: number;
  currentRulesVersion: number;
  currentSamplerVersion: number;
  currentAttributionVersion: number;
  deckIds?: string[];
  runSettings?: RunSettingsFilter;
}): Promise<CardDatabaseResponse> {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    attribution_version: String(options.attributionVersion),
    current_rules_version: String(options.currentRulesVersion),
    current_sampler_version: String(options.currentSamplerVersion),
    current_attribution_version: String(options.currentAttributionVersion),
  });
  if (options.source && options.source !== "evaluate") {
    search.set("source", options.source);
  }
  for (const deckId of options.deckIds ?? []) {
    search.append("deck_id", deckId);
  }
  if (options.deckIds !== undefined) {
    search.set("deck_filter", "1");
  }
  appendRunSettingsFilter(search, options.runSettings);
  const response = await apiFetch(`/analysis/card-database?${search}`);
  return response.json() as Promise<CardDatabaseResponse>;
}

export type CardDatabaseCardDecksResponse = {
  decks: Array<{
    deckId: string;
    name: string;
    copies: number | null;
    runCount: number;
    samples: number;
    damageWhenSeen: number | null;
    withHandMean: number | null;
    withoutHandMean: number | null;
    handLift: number | null;
    withHandSamples: number;
    withoutHandSamples: number;
  }>;
};

export async function fetchCardDatabaseCardDecks(options: {
  source?: CardDatabaseSource;
  cardId: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  attributionVersion: number;
  deckIds?: string[];
  runSettings?: RunSettingsFilter;
}): Promise<CardDatabaseCardDecksResponse> {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    attribution_version: String(options.attributionVersion),
  });
  if (options.source && options.source !== "evaluate") {
    search.set("source", options.source);
  }
  for (const deckId of options.deckIds ?? []) {
    search.append("deck_id", deckId);
  }
  if (options.deckIds !== undefined) {
    search.set("deck_filter", "1");
  }
  appendRunSettingsFilter(search, options.runSettings);
  const response = await apiFetch(
    `/analysis/card-database/${encodeURIComponent(options.cardId)}/decks?${search}`,
  );
  return response.json() as Promise<CardDatabaseCardDecksResponse>;
}

export type CardPlayMatrixResponse = {
  totalPlays: number;
  totalSamples: number;
  cells: Array<{
    turn: number;
    phase: string;
    plays: number;
    shareOfPlays: number;
    perSample: number;
  }>;
};

export async function fetchCardDatabasePlayMatrix(options: {
  source?: CardDatabaseSource;
  cardId: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  attributionVersion: number;
  deckIds?: string[];
  runSettings?: RunSettingsFilter;
}): Promise<CardPlayMatrixResponse> {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    attribution_version: String(options.attributionVersion),
  });
  if (options.source && options.source !== "evaluate") {
    search.set("source", options.source);
  }
  for (const deckId of options.deckIds ?? []) {
    search.append("deck_id", deckId);
  }
  if (options.deckIds !== undefined) {
    search.set("deck_filter", "1");
  }
  appendRunSettingsFilter(search, options.runSettings);
  const response = await apiFetch(
    `/analysis/card-database/${encodeURIComponent(options.cardId)}/play-matrix?${search}`,
  );
  return response.json() as Promise<CardPlayMatrixResponse>;
}

export type CardDatabasePairingRow = {
  cardId: string;
  name: string;
  bothMean: number;
  selectedWithoutPartnerMean: number;
  partnerWithoutSelectedMean: number;
  pairsWithMeDelta: number;
  dependsOnMeDelta: number;
  bothCount: number;
  selectedWithoutPartnerCount: number;
  partnerWithoutSelectedCount: number;
};

export type CardDatabasePairingsResponse = {
  cardId: string;
  totalSamples: number;
  partners: CardDatabasePairingRow[];
};

export async function fetchCardDatabasePairings(options: {
  source?: CardDatabaseSource;
  cardId: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  attributionVersion: number;
  deckIds?: string[];
  runSettings?: RunSettingsFilter;
}): Promise<CardDatabasePairingsResponse> {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    attribution_version: String(options.attributionVersion),
  });
  if (options.source && options.source !== "evaluate") {
    search.set("source", options.source);
  }
  for (const deckId of options.deckIds ?? []) {
    search.append("deck_id", deckId);
  }
  if (options.deckIds !== undefined) {
    search.set("deck_filter", "1");
  }
  appendRunSettingsFilter(search, options.runSettings);
  const response = await apiFetch(
    `/analysis/card-database/${encodeURIComponent(options.cardId)}/pairings?${search}`,
  );
  return response.json() as Promise<CardDatabasePairingsResponse>;
}
