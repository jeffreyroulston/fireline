import type {
  PlaytestApplyRequest,
  PlaytestApplyResult,
  PlaytestInitRequest,
  PlaytestInitResult,
  PlaytestLegalActionsRequest,
  PlaytestLegalActionsResult,
  PlaytestLegalTargetsRequest,
  PlaytestLegalTargetsResult,
} from "@ga-fire/contracts";
import type { ApiCardRow } from "@ga-fire/game";

/** Must include next.config basePath so rewrites match `/play/api/*`. */
const API_PREFIX = "/play/api";

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
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
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

export type EngineVersionResponse = {
  rules: number;
  sampler: number;
  attribution: number;
  cardDigest: string;
  build: string;
};

export async function fetchEngineVersion(): Promise<EngineVersionResponse> {
  const response = await apiFetch("/version");
  return response.json();
}

export async function fetchCatalogCards(): Promise<ApiCardRow[]> {
  const response = await apiFetch("/cards");
  return response.json();
}

/** Rules step protocol (`/game/v1/*`). Wire types still match playtest contracts in v1. */
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

export async function playtestLegalTargets(
  request: PlaytestLegalTargetsRequest,
): Promise<PlaytestLegalTargetsResult> {
  const response = await apiFetch("/game/v1/legal-targets", {
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
