import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Kysely, Migrator, PostgresDialect, FileMigrationProvider } from "kysely";
import pg from "pg";
import type { Database } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createDb(connectionString: string): Kysely<Database> {
  const pool = new pg.Pool({ connectionString });
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  results?.forEach((result) => {
    if (result.status === "Success") {
      console.log(`migration "${result.migrationName}" succeeded`);
    } else if (result.status === "Error") {
      console.error(`migration "${result.migrationName}" failed`);
    }
  });
  if (error) {
    throw error;
  }
}

export async function sweepInterruptedRuns(db: Kysely<Database>): Promise<number> {
  const result = await db
    .updateTable("runs")
    .set({
      status: "interrupted",
      completed_at: new Date(),
      error_message: "API restarted while run was in flight",
    })
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0);
}
