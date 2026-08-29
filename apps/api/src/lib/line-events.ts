import type { LineEvent, SparseLineStats } from "@ga-fire/contracts";
import type { Insertable } from "kysely";
import type { RunSampleEventsTable } from "../db/types.js";
import { toJsonb } from "./jsonb.js";

type EventRow = Insertable<RunSampleEventsTable>;

/** Split a LineEvent into FK columns + jsonb payload for run_sample_events. */
export function lineEventToRow(
  sampleId: string,
  seq: number,
  event: LineEvent,
): EventRow {
  const { card, drawn, discarded, op, kind, actionIndex, ...rest } = event;
  return {
    sample_id: sampleId,
    seq,
    action_index: actionIndex,
    op: String(op),
    kind: String(kind),
    card_id: card ?? null,
    drawn_id: drawn ?? null,
    discarded_id: discarded ?? null,
    payload: toJsonb(rest) as unknown as Record<string, unknown>,
  };
}

/** Rebuild a LineEvent from a stored event row. */
export function rowToLineEvent(row: {
  action_index: number;
  op: string;
  kind: string;
  card_id: string | null;
  drawn_id: string | null;
  discarded_id: string | null;
  payload: Record<string, unknown>;
}): LineEvent {
  const payload = row.payload ?? {};
  return {
    op: row.op as LineEvent["op"],
    kind: row.kind as LineEvent["kind"],
    actionIndex: row.action_index,
    turn: Number(payload.turn ?? 0),
    phase: payload.phase as LineEvent["phase"],
    damage: Number(payload.damage ?? 0),
    fireGy: Number(payload.fireGy ?? 0),
    card: row.card_id,
    kindle: (payload.kindle as number | null | undefined) ?? null,
    drawn: row.drawn_id,
    memoryDraw: (payload.memoryDraw as string | null | undefined) ?? null,
    discarded: row.discarded_id,
    prepared: (payload.prepared as boolean | null | undefined) ?? null,
    imbue: (payload.imbue as boolean | null | undefined) ?? null,
    weapon: (payload.weapon as string | null | undefined) ?? null,
    commandAlly: (payload.commandAlly as string | null | undefined) ?? null,
    bonuses: (payload.bonuses as LineEvent["bonuses"]) ?? null,
    hand: (payload.hand as string[] | null | undefined) ?? null,
    memory: (payload.memory as string[] | null | undefined) ?? null,
    allies: (payload.allies as string[] | null | undefined) ?? null,
    fast: Boolean(payload.fast),
    doubled: Boolean(payload.doubled),
    fromMemory: Boolean(payload.fromMemory),
    heated: Boolean(payload.heated),
    human: Boolean(payload.human),
    gyThreshold: Boolean(payload.gyThreshold),
  };
}

export function sparseStatsRows(
  sampleId: string,
  stats: SparseLineStats | null | undefined,
): Array<{
  sample_id: string;
  card_id: string;
  plays: number;
  attacks: number;
  damage: number;
  drawn: number;
}> {
  if (!stats) {
    return [];
  }
  const cardIds = new Set([
    ...Object.keys(stats.plays ?? {}),
    ...Object.keys(stats.attacks ?? {}),
    ...Object.keys(stats.damage ?? {}),
    ...Object.keys(stats.drawn ?? {}),
  ]);
  return [...cardIds].map((cardId) => ({
    sample_id: sampleId,
    card_id: cardId,
    plays: stats.plays?.[cardId] ?? 0,
    attacks: stats.attacks?.[cardId] ?? 0,
    damage: stats.damage?.[cardId] ?? 0,
    drawn: stats.drawn?.[cardId] ?? 0,
  }));
}
