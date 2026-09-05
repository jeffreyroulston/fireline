import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type {
  PlaytestAction,
  PlaytestApplyResult,
  PlaytestInitRequest,
  PlaytestInitResult,
  PlaytestLegalActionsResult,
} from "@ga-fire/contracts";
import {
  applyCrossSeatEffects,
  DUEL_CHAMPION_LIFE,
  DuelError,
  gameHub,
  isPassAction,
  otherSeat,
  snapshotRoom,
  sseJson,
  type DuelRoom,
  type SeatId,
} from "../services/game-hub.js";
import { fetchWorkerJson, WorkerError } from "../services/worker.js";
import type { AppDeps } from "./types.js";

function clientIdFrom(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header("x-game-client-id") ?? null;
}

function jsonError(c: { json: (body: unknown, status: number) => Response }, error: unknown) {
  if (error instanceof DuelError) {
    return c.json(
      { error: error.message },
      error.status as 400 | 401 | 403 | 404 | 409,
    );
  }
  if (error instanceof WorkerError) {
    return c.json(
      { error: error.message },
      (error.status === 503 ? 503 : 400) as 400 | 503,
    );
  }
  throw error;
}

async function workerInit(
  workerBase: string,
  request: PlaytestInitRequest,
): Promise<PlaytestInitResult> {
  return fetchWorkerJson<PlaytestInitResult>(workerBase, "/game/v1/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

async function workerLegal(
  workerBase: string,
  engine: PlaytestInitResult["state"]["engine"],
): Promise<PlaytestLegalActionsResult> {
  return fetchWorkerJson<PlaytestLegalActionsResult>(workerBase, "/game/v1/legal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: engine }),
  });
}

async function workerApply(
  workerBase: string,
  engine: PlaytestInitResult["state"]["engine"],
  action: PlaytestAction,
): Promise<PlaytestApplyResult> {
  return fetchWorkerJson<PlaytestApplyResult>(workerBase, "/game/v1/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: engine, action }),
  });
}

function requireRoom(code: string): DuelRoom {
  const room = gameHub.get(code);
  if (!room) {
    throw new DuelError(404, "Duel not found.");
  }
  return room;
}

function requireSeat(room: DuelRoom, clientId: string | null): SeatId {
  if (!clientId) {
    throw new DuelError(401, "Missing X-Game-Client-Id.");
  }
  const seat = gameHub.seatForClient(room, clientId);
  if (!seat) {
    throw new DuelError(403, "Not a member of this duel.");
  }
  return seat;
}

/** Champion duel rooms — two seats, two FiZa boards, cross-seat champion damage. */
export function registerDuelRoutes(app: Hono, options: AppDeps): void {
  const { workerBase } = options;

  app.post("/game/v1/duels", (c) => {
    const { room, clientId, seat } = gameHub.createRoom();
    return c.json(
      {
        code: room.code,
        seat,
        clientId,
        snapshot: snapshotRoom(room),
      },
      201,
    );
  });

  app.post("/game/v1/duels/:code/join", (c) => {
    try {
      const { room, clientId, seat } = gameHub.joinRoom(c.req.param("code"));
      return c.json({
        code: room.code,
        seat,
        clientId,
        snapshot: snapshotRoom(room),
      });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  /** Resume a seat after refresh — same clientId, no new join slot. */
  app.post("/game/v1/duels/:code/rejoin", (c) => {
    try {
      const room = requireRoom(c.req.param("code"));
      const clientId = clientIdFrom(c);
      const seat = requireSeat(room, clientId);
      return c.json({
        code: room.code,
        seat,
        clientId,
        snapshot: snapshotRoom(room),
      });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get("/game/v1/duels/:code", (c) => {
    try {
      const room = requireRoom(c.req.param("code"));
      return c.json(snapshotRoom(room));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post("/game/v1/duels/:code/ready", async (c) => {
    try {
      const room = requireRoom(c.req.param("code"));
      const seat = requireSeat(room, clientIdFrom(c));
      if (room.status !== "lobby") {
        throw new DuelError(409, "Duel already started.");
      }
      const body = await c.req.json<PlaytestInitRequest>();
      if (!Array.isArray(body.hand) || body.hand.length < 2) {
        throw new DuelError(400, "Hand must include at least two cards.");
      }
      const seatState = room.seats[seat];
      seatState.initRequest = body;
      seatState.ready = true;
      gameHub.publish(room);
      return c.json(snapshotRoom(room));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post("/game/v1/duels/:code/start", async (c) => {
    try {
      const room = requireRoom(c.req.param("code"));
      const seat = requireSeat(room, clientIdFrom(c));
      if (seat !== "A") {
        throw new DuelError(403, "Only the host (seat A) can start the duel.");
      }
      if (room.status !== "lobby") {
        throw new DuelError(409, "Duel already started.");
      }
      if (!room.seats.A.ready || !room.seats.B.ready) {
        throw new DuelError(409, "Both players must be ready.");
      }
      if (!room.seats.A.initRequest || !room.seats.B.initRequest) {
        throw new DuelError(409, "Both players must submit a setup.");
      }
      if (!room.seats.B.clientId) {
        throw new DuelError(409, "Waiting for opponent to join.");
      }

      for (const id of ["A", "B"] as SeatId[]) {
        const seatState = room.seats[id];
        const init = await workerInit(workerBase, seatState.initRequest!);
        const legal = await workerLegal(workerBase, init.state.engine);
        seatState.engine = init.state.engine;
        seatState.board = init.state;
        seatState.events = [...init.events];
        seatState.legalActions = legal.actions;
        seatState.championLife = DUEL_CHAMPION_LIFE;
        seatState.damageBaseline = init.state.damage;
      }

      room.controller = "A";
      room.winnerSeat = null;
      room.status = "playing";
      gameHub.publish(room);
      return c.json(snapshotRoom(room));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post("/game/v1/duels/:code/action", async (c) => {
    try {
      const room = requireRoom(c.req.param("code"));
      const seat = requireSeat(room, clientIdFrom(c));
      if (room.status !== "playing") {
        throw new DuelError(409, "Duel is not in progress.");
      }
      if (seat !== room.controller) {
        throw new DuelError(403, "Not your turn.");
      }

      const body = await c.req.json<{ action: PlaytestAction }>();
      const seatState = room.seats[seat];
      if (!seatState.engine || !seatState.board) {
        throw new DuelError(409, "Seat has no board.");
      }

      const beforeDamage = seatState.board.damage;
      const applied = await workerApply(workerBase, seatState.engine, body.action);
      seatState.engine = applied.state.engine;
      seatState.board = applied.state;
      seatState.events = [...seatState.events, ...applied.events];

      applyCrossSeatEffects(room, seat, beforeDamage, applied.state.damage);

      if (room.status === "playing" && !applied.state.terminal) {
        const legal = await workerLegal(workerBase, applied.state.engine);
        seatState.legalActions = legal.actions;
      } else {
        seatState.legalActions = [];
      }

      if (room.status === "playing" && isPassAction(body.action)) {
        room.controller = otherSeat(seat);
        // Opponent acts on their own board; refresh their legal if needed.
        const next = room.seats[room.controller];
        if (next.engine && next.board && !next.board.terminal) {
          const legal = await workerLegal(workerBase, next.engine);
          next.legalActions = legal.actions;
          next.damageBaseline = next.board.damage;
        }
      }

      gameHub.publish(room);
      return c.json(snapshotRoom(room));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get("/game/v1/duels/:code/events", (c) => {
    const code = c.req.param("code");
    // EventSource cannot set headers — accept clientId as query param.
    const clientId = c.req.query("clientId") ?? clientIdFrom(c);
    try {
      const room = requireRoom(code);
      requireSeat(room, clientId);
    } catch (error) {
      return jsonError(c, error);
    }

    c.header("Cache-Control", "no-cache, no-transform");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

    return streamSSE(c, async (stream) => {
      let done = false;
      let wake = () => {};
      const write = async (event: unknown) => {
        try {
          await stream.writeSSE({ data: sseJson(event) });
        } catch {
          done = true;
          wake();
        }
      };

      const pending: Promise<void>[] = [];
      let unsubscribe: (() => void) | null = null;
      try {
        unsubscribe = gameHub.subscribe(code, (event) => {
          pending.push(write(event));
          wake();
        });
      } catch (error) {
        if (error instanceof DuelError) {
          await write({ type: "error", message: error.message });
          return;
        }
        throw error;
      }

      stream.onAbort(() => {
        done = true;
        unsubscribe?.();
        wake();
      });

      while (!done) {
        while (pending.length > 0) {
          await pending.shift();
        }
        if (done) break;
        await stream.write(": keep-alive\n\n");
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 15_000);
        });
      }
      unsubscribe?.();
    });
  });
}
