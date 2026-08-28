import type { Kysely } from "kysely";
import type { LineEvent } from "@ga-fire/contracts";
import type { Database } from "../db/types.js";
import { rowToLineEvent } from "./line-events.js";

/** Load combat tapes for many samples, keyed by sample id. */
export async function loadEventsBySampleId(
  db: Kysely<Database>,
  sampleIds: string[],
): Promise<Map<string, LineEvent[]>> {
  const bySample = new Map<string, LineEvent[]>();
  if (sampleIds.length === 0) {
    return bySample;
  }
  const rows = await db
    .selectFrom("run_sample_events")
    .select([
      "sample_id",
      "seq",
      "action_index",
      "op",
      "kind",
      "card_id",
      "drawn_id",
      "discarded_id",
      "payload",
    ])
    .where("sample_id", "in", sampleIds)
    .orderBy("sample_id")
    .orderBy("seq")
    .execute();

  for (const row of rows) {
    let events = bySample.get(row.sample_id);
    if (!events) {
      events = [];
      bySample.set(row.sample_id, events);
    }
    events.push(
      rowToLineEvent({
        action_index: row.action_index,
        op: row.op,
        kind: row.kind,
        card_id: row.card_id,
        drawn_id: row.drawn_id,
        discarded_id: row.discarded_id,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      }),
    );
  }
  return bySample;
}
