import { randomBytes, randomUUID } from "node:crypto";
import type {
  LineEvent,
  PlaytestAction,
  PlaytestActionOption,
  PlaytestEngineState,
  PlaytestInitRequest,
  PlaytestStateView,
} from "@ga-fire/contracts";
import { sseJson } from "./run-hub.js";

export type SeatId = "A" | "B";

export type SeatPublic = {
  ready: boolean;
  hasClient: boolean;
  championLife: number;
  board: PlaytestStateView | null;
  events: LineEvent[];
  legalActions: PlaytestActionOption[];
};

export type DuelSnapshot = {
  type: "duel";
  code: string;
  status: "lobby" | "playing" | "done";
  controller: SeatId;
  winnerSeat: SeatId | null;
  seats: { A: SeatPublic; B: SeatPublic };
};

type SeatInternal = {
  clientId: string | null;
  ready: boolean;
  initRequest: PlaytestInitRequest | null;
  engine: PlaytestEngineState | null;
  board: PlaytestStateView | null;
  events: LineEvent[];
  legalActions: PlaytestActionOption[];
  championLife: number;
  damageBaseline: number;
};

type DuelRoom = {
  code: string;
  seats: { A: SeatInternal; B: SeatInternal };
  controller: SeatId;
  winnerSeat: SeatId | null;
  status: "lobby" | "playing" | "done";
  subscribers: Set<(event: DuelSnapshot) => void>;
};

/** Starting champion life — same constant as solo Spirit life. */
export const DUEL_CHAMPION_LIFE = 15;

function emptySeat(): SeatInternal {
  return {
    clientId: null,
    ready: false,
    initRequest: null,
    engine: null,
    board: null,
    events: [],
    legalActions: [],
    championLife: DUEL_CHAMPION_LIFE,
    damageBaseline: 0,
  };
}

function otherSeat(seat: SeatId): SeatId {
  return seat === "A" ? "B" : "A";
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i]! % alphabet.length];
  }
  return code;
}

function seatPublic(seat: SeatInternal): SeatPublic {
  return {
    ready: seat.ready,
    hasClient: seat.clientId != null,
    championLife: seat.championLife,
    board: seat.board,
    events: seat.events,
    legalActions: seat.legalActions,
  };
}

export function snapshotRoom(room: DuelRoom): DuelSnapshot {
  return {
    type: "duel",
    code: room.code,
    status: room.status,
    controller: room.controller,
    winnerSeat: room.winnerSeat,
    seats: {
      A: seatPublic(room.seats.A),
      B: seatPublic(room.seats.B),
    },
  };
}

/**
 * Cross-seat effect boundary (v1): attribute FiZa damage deltas to the
 * opponent champion. v2 can extend this for ally targeting.
 */
export function applyCrossSeatEffects(
  room: DuelRoom,
  actor: SeatId,
  beforeDamage: number,
  afterDamage: number,
): void {
  const delta = Math.max(0, afterDamage - beforeDamage);
  if (delta === 0) {
    return;
  }
  const opponent = otherSeat(actor);
  const seat = room.seats[opponent];
  seat.championLife = Math.max(0, seat.championLife - delta);
  room.seats[actor].damageBaseline = afterDamage;
  if (seat.championLife <= 0 && room.winnerSeat == null) {
    room.winnerSeat = actor;
    room.status = "done";
  }
}

export function isPassAction(action: PlaytestAction): boolean {
  return action.op === "pass";
}

export class GameHub {
  private readonly rooms = new Map<string, DuelRoom>();

  createRoom(): { room: DuelRoom; clientId: string; seat: SeatId } {
    let code = makeCode();
    while (this.rooms.has(code)) {
      code = makeCode();
    }
    const clientId = randomUUID();
    const room: DuelRoom = {
      code,
      seats: { A: emptySeat(), B: emptySeat() },
      controller: "A",
      winnerSeat: null,
      status: "lobby",
      subscribers: new Set(),
    };
    room.seats.A.clientId = clientId;
    this.rooms.set(code, room);
    return { room, clientId, seat: "A" };
  }

  get(code: string): DuelRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  joinRoom(code: string): { room: DuelRoom; clientId: string; seat: SeatId } {
    const room = this.get(code);
    if (!room) {
      throw new DuelError(404, "Duel not found.");
    }
    if (room.seats.B.clientId) {
      throw new DuelError(409, "Duel is full.");
    }
    if (room.status !== "lobby") {
      throw new DuelError(409, "Duel already started.");
    }
    const clientId = randomUUID();
    room.seats.B.clientId = clientId;
    this.publish(room);
    return { room, clientId, seat: "B" };
  }

  seatForClient(room: DuelRoom, clientId: string): SeatId | null {
    if (room.seats.A.clientId === clientId) return "A";
    if (room.seats.B.clientId === clientId) return "B";
    return null;
  }

  publish(room: DuelRoom): void {
    const snap = snapshotRoom(room);
    for (const subscriber of room.subscribers) {
      subscriber(snap);
    }
  }

  subscribe(code: string, send: (event: DuelSnapshot) => void): () => void {
    const room = this.get(code);
    if (!room) {
      throw new DuelError(404, "Duel not found.");
    }
    room.subscribers.add(send);
    send(snapshotRoom(room));
    return () => {
      room.subscribers.delete(send);
    };
  }
}

export class DuelError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DuelError";
  }
}

export const gameHub = new GameHub();

export { sseJson, otherSeat };
export type { DuelRoom, SeatInternal };
