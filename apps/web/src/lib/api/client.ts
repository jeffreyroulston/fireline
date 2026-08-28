import type { LineEvent, SolveRequest, SolveResult } from "@ga-fire/contracts";

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

export type WorkerVersion = {
  rules: number;
  sampler: number;
  attribution: number;
  cardDigest: string;
  build: string;
};

export async function fetchWorkerVersion(): Promise<WorkerVersion> {
  const response = await apiFetch("/version");
  return response.json();
}

export async function fetchCards(): Promise<
  Array<{
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
  }>
> {
  const response = await apiFetch("/cards");
  return response.json();
}

export async function solve(
  request: SolveRequest,
): Promise<SolveResult & { sampleId?: string | null }> {
  const response = await apiFetch("/solve", {
    method: "POST",
    body: JSON.stringify(request, (_key, value) =>
      typeof value === "bigint" ? Number(value) : value,
    ),
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
  damageGt?: number;
  damageGte?: number;
  damageLt?: number;
  damageLte?: number;
}) {
  const response = await apiFetch(
    `/analysis/card-leaderboard${analysisQuery({
      deck_hash: options.deckHash,
      sim_type: options.simType,
      rules_version: options.rulesVersion,
      sampler_version: options.samplerVersion,
      card_digest: options.cardDigest,
      attribution_version: options.attributionVersion,
      damage_gt: options.damageGt,
      damage_gte: options.damageGte,
      damage_lt: options.damageLt,
      damage_lte: options.damageLte,
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
  events: LineEvent[];
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
    cardDigest: string;
  };
  attributionVersion: number;
  currentVersion: {
    rulesVersion: number;
    samplerVersion: number;
    cardDigest: string;
  };
  currentAttributionVersion: number;
  totalRuns: number;
  totalSamples: number;
  contributors: CardDatabaseContributor[];
  cards: CardDatabaseCard[];
};

export async function fetchCardDatabase(options: {
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
  attributionVersion: number;
  currentRulesVersion: number;
  currentSamplerVersion: number;
  currentCardDigest: string;
  currentAttributionVersion: number;
  deckIds?: string[];
}): Promise<CardDatabaseResponse> {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    card_digest: options.cardDigest,
    attribution_version: String(options.attributionVersion),
    current_rules_version: String(options.currentRulesVersion),
    current_sampler_version: String(options.currentSamplerVersion),
    current_card_digest: options.currentCardDigest,
    current_attribution_version: String(options.currentAttributionVersion),
  });
  for (const deckId of options.deckIds ?? []) {
    search.append("deck_id", deckId);
  }
  if (options.deckIds !== undefined) {
    search.set("deck_filter", "1");
  }
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
  cardId: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
  attributionVersion: number;
  deckIds?: string[];
}): Promise<CardDatabaseCardDecksResponse> {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    card_digest: options.cardDigest,
    attribution_version: String(options.attributionVersion),
  });
  for (const deckId of options.deckIds ?? []) {
    search.append("deck_id", deckId);
  }
  if (options.deckIds !== undefined) {
    search.set("deck_filter", "1");
  }
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
  cardId: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
  attributionVersion: number;
  deckIds?: string[];
}): Promise<CardPlayMatrixResponse> {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    card_digest: options.cardDigest,
    attribution_version: String(options.attributionVersion),
  });
  for (const deckId of options.deckIds ?? []) {
    search.append("deck_id", deckId);
  }
  if (options.deckIds !== undefined) {
    search.set("deck_filter", "1");
  }
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
  cardId: string;
  simType: string;
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
  attributionVersion: number;
  deckIds?: string[];
}): Promise<CardDatabasePairingsResponse> {
  const search = new URLSearchParams({
    sim_type: options.simType,
    rules_version: String(options.rulesVersion),
    sampler_version: String(options.samplerVersion),
    card_digest: options.cardDigest,
    attribution_version: String(options.attributionVersion),
  });
  for (const deckId of options.deckIds ?? []) {
    search.append("deck_id", deckId);
  }
  if (options.deckIds !== undefined) {
    search.set("deck_filter", "1");
  }
  const response = await apiFetch(
    `/analysis/card-database/${encodeURIComponent(options.cardId)}/pairings?${search}`,
  );
  return response.json() as Promise<CardDatabasePairingsResponse>;
}
