import { type Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("runs")
    .addColumn("optimize_strategy", "text")
    .execute();

  await db.schema
    .alterTable("run_candidates")
    .addColumn("candidate", "text")
    .addColumn("score_delta", "double precision")
    .addColumn("card_stats", "jsonb")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("run_candidates")
    .dropColumn("card_stats")
    .dropColumn("score_delta")
    .dropColumn("candidate")
    .execute();

  await db.schema.alterTable("runs").dropColumn("optimize_strategy").execute();
}
