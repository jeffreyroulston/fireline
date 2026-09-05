import type {
  PlaytestAction,
  PlaytestInitRequest,
} from "@ga-fire/contracts";

/** Must include next.config basePath so rewrites match `/play/api/*`. */
const API_PREFIX = "/play/api";

export type SeatId = "A" | "B";

export type SeatPublic = {
  ready: boolean;
  hasClient: boolean;
  championLife: number;
  board: import("@ga-fire/contracts").PlaytestStateView | null;
  events: import("@ga-fire/contracts").LineEvent[];
  legalActions: import("@ga-fire/contracts").PlaytestActionOption[];
};

export type DuelSnapshot = {
  type: "duel";
  code: string;
  status: "lobby" | "playing" | "done";
  controller: SeatId;
  winnerSeat: SeatId | null;
  seats: { A: SeatPublic; B: SeatPublic };
};

export type DuelJoinResponse = {
  code: string;
  seat: SeatId;
  clientId: string;
  snapshot: DuelSnapshot;
};

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

async function duelFetch(
  path: string,
  init?: RequestInit & { clientId?: string },
): Promise<Response> {
  const { clientId, ...rest } = init ?? {};
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(clientId ? { "X-Game-Client-Id": clientId } : {}),
      ...rest.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
}

export async function createDuel(): Promise<DuelJoinResponse> {
  const response = await duelFetch("/game/v1/duels", { method: "POST" });
  return response.json();
}

export async function joinDuel(code: string): Promise<DuelJoinResponse> {
  const response = await duelFetch(
    `/game/v1/duels/${encodeURIComponent(code.trim().toUpperCase())}/join`,
    { method: "POST" },
  );
  return response.json();
}

export async function rejoinDuel(
  code: string,
  clientId: string,
): Promise<DuelJoinResponse> {
  const response = await duelFetch(
    `/game/v1/duels/${encodeURIComponent(code.trim().toUpperCase())}/rejoin`,
    { method: "POST", clientId },
  );
  return response.json();
}

export async function readyDuel(
  code: string,
  clientId: string,
  request: PlaytestInitRequest,
): Promise<DuelSnapshot> {
  const response = await duelFetch(
    `/game/v1/duels/${encodeURIComponent(code)}/ready`,
    {
      method: "POST",
      clientId,
      body: JSON.stringify(request),
    },
  );
  return response.json();
}

export async function startDuel(
  code: string,
  clientId: string,
): Promise<DuelSnapshot> {
  const response = await duelFetch(
    `/game/v1/duels/${encodeURIComponent(code)}/start`,
    { method: "POST", clientId },
  );
  return response.json();
}

export async function duelAction(
  code: string,
  clientId: string,
  action: PlaytestAction,
): Promise<DuelSnapshot> {
  const response = await duelFetch(
    `/game/v1/duels/${encodeURIComponent(code)}/action`,
    {
      method: "POST",
      clientId,
      body: JSON.stringify({ action }),
    },
  );
  return response.json();
}

/** Open an SSE stream for duel snapshots. Caller must close the EventSource. */
export function subscribeDuel(
  code: string,
  clientId: string,
  onSnapshot: (snapshot: DuelSnapshot) => void,
  onError?: (message: string) => void,
): EventSource {
  const url = `${API_PREFIX}/game/v1/duels/${encodeURIComponent(code)}/events?clientId=${encodeURIComponent(clientId)}`;
  const source = new EventSource(url);
  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as
        | DuelSnapshot
        | { type: "error"; message: string };
      if (data && typeof data === "object" && "type" in data) {
        if (data.type === "error") {
          onError?.(data.message);
          return;
        }
        if (data.type === "duel") {
          onSnapshot(data);
        }
      }
    } catch {
      onError?.("Failed to parse duel event.");
    }
  };
  source.onerror = () => {
    onError?.("Duel connection lost.");
  };
  return source;
}
