export async function readErrorMessage(response: Response): Promise<string> {
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

export function serializeJsonBody(body: unknown): string {
  return JSON.stringify(body, (_key, value) =>
    typeof value === "bigint" ? Number(value) : value,
  );
}

export function prepareRequestBody(
  init?: RequestInit,
): RequestInit["body"] | undefined {
  if (!init?.body || typeof init.body !== "string") {
    return init?.body;
  }
  return serializeJsonBody(JSON.parse(init.body));
}

export function analysisQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type RunSettingsFilter = {
  goFirst?: boolean[];
  maxTurns?: number[];
};

export function appendRunSettingsFilter(
  search: URLSearchParams,
  filter?: RunSettingsFilter,
): void {
  if (!filter) {
    return;
  }
  for (const goFirst of filter.goFirst ?? []) {
    search.append("go_first", goFirst ? "1" : "0");
  }
  for (const maxTurns of filter.maxTurns ?? []) {
    search.append("max_turns", String(maxTurns));
  }
}

export type WorkerVersion = {
  rules: number;
  sampler: number;
  attribution: number;
  cardDigest: string;
  build: string;
};

export type ApiCardRow = {
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
};
