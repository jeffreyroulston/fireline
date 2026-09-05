import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Database } from "./db/types.js";
import type { RunDispatcher } from "./services/dispatch.js";
import { registerDeckRoutes } from "./routes/decks.js";
import { registerDuelRoutes } from "./routes/duels.js";
import { registerGameRoutes } from "./routes/game.js";
import { registerPlayDeckRoutes } from "./routes/play-decks.js";
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
  registerDuelRoutes(app, deps);
  registerDeckRoutes(app, deps);
  registerPlayDeckRoutes(app, deps);
  registerWorkbenchRoutes(app, deps);

  return app;
}
