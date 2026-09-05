import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import type { RunDispatcher } from "../services/dispatch.js";

/** Dependencies shared by all API route surfaces. */
export type AppDeps = {
  db: Kysely<Database>;
  workerBase: string;
  dispatcher: RunDispatcher;
  maxConcurrency: number;
};
