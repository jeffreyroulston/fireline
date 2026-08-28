import type { Kysely } from "kysely";
import type { Database } from "../types.js";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("runs")
    .addColumn("p10_damage", "smallint")
    .execute();
  await db.schema
    .alterTable("runs")
    .addColumn("mean_end_influence", "double precision")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("runs").dropColumn("mean_end_influence").execute();
  await db.schema.alterTable("runs").dropColumn("p10_damage").execute();
}
