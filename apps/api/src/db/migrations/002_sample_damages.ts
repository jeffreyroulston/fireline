import type { Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("runs")
    .addColumn("sample_damages", "jsonb")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("runs").dropColumn("sample_damages").execute();
}
