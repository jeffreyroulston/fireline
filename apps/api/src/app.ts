import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Database } from "./db/types.js";
import type { RunDispatcher } from "./services/dispatch.js";
import { registerDeckRoutes } from "./routes/decks.js";
import { registerGameRoutes } from "./routes/game.js";
import { registerSharedRoutes } from "./routes/shared.js";
import { registerWorkbenchRoutes } from "./routes/workbench.js";
import type { AppDeps } from "./routes/types.js";

export function createApp(options: {
  db: Kysely<Database>;
  workerBase: string;
  dispatcher: RunDispatcher;
  maxConcurrency: number;
}) {
  const app = new Hono();
  const deps: AppDeps = options;

  registerSharedRoutes(app, deps);
  registerGameRoutes(app, deps);
  registerDeckRoutes(app, deps);
  registerWorkbenchRoutes(app, deps);

  return app;
}
