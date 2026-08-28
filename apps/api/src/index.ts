import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb, migrateToLatest, sweepInterruptedRuns } from "./db/index.js";
import { env, envInt } from "./env.js";
import { ConcurrencyGate, RunDispatcher } from "./services/dispatch.js";

async function main() {
  const databaseUrl = env("DATABASE_URL");
  const workerBase = env("WORKER_URL", "http://127.0.0.1:8081");
  const port = envInt("API_PORT", 8080);
  const host = process.env.API_HOST ?? "0.0.0.0";
  const concurrency = envInt("API_CONCURRENCY", envInt("WORKER_CONCURRENCY", 2));

  const db = createDb(databaseUrl);
  await migrateToLatest(db);
  const interrupted = await sweepInterruptedRuns(db);
  if (interrupted > 0) {
    console.log(`marked ${interrupted} in-flight run(s) as interrupted`);
  }

  const gate = new ConcurrencyGate(concurrency);
  const dispatcher = new RunDispatcher(db, workerBase, gate);
  const app = createApp({ db, workerBase, dispatcher, maxConcurrency: concurrency });

  console.log(`data API listening on http://${host}:${port}`);
  serve({ fetch: app.fetch, port, hostname: host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
