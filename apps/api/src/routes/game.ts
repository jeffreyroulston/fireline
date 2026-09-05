import type { Hono } from "hono";
import type {
  PlaytestApplyRequest,
  PlaytestApplyResult,
  PlaytestInitRequest,
  PlaytestInitResult,
  PlaytestLegalActionsRequest,
  PlaytestLegalActionsResult,
  PlaytestLegalTargetsRequest,
  PlaytestLegalTargetsResult,
} from "@ga-fire/contracts";
import { proxyPlaytestJson } from "./proxy-playtest.js";
import type { AppDeps } from "./types.js";

/**
 * Interactive rules step protocol (Full rules).
 * Prefer `/game/v1/*`; `/playtest/*` is a legacy alias to the same worker handlers.
 */
export function registerGameRoutes(app: Hono, options: AppDeps): void {
  const { workerBase } = options;

  app.post("/playtest/init", (c) =>
    proxyPlaytestJson<PlaytestInitRequest, PlaytestInitResult>(
      c,
      workerBase,
      "/playtest/init",
    ),
  );
  app.post("/playtest/legal-actions", (c) =>
    proxyPlaytestJson<PlaytestLegalActionsRequest, PlaytestLegalActionsResult>(
      c,
      workerBase,
      "/playtest/legal-actions",
    ),
  );
  app.post("/playtest/apply", (c) =>
    proxyPlaytestJson<PlaytestApplyRequest, PlaytestApplyResult>(
      c,
      workerBase,
      "/playtest/apply",
    ),
  );

  app.post("/game/v1/init", (c) =>
    proxyPlaytestJson<PlaytestInitRequest, PlaytestInitResult>(
      c,
      workerBase,
      "/game/v1/init",
    ),
  );
  app.post("/game/v1/legal", (c) =>
    proxyPlaytestJson<PlaytestLegalActionsRequest, PlaytestLegalActionsResult>(
      c,
      workerBase,
      "/game/v1/legal",
    ),
  );
  app.post("/game/v1/legal-targets", (c) =>
    proxyPlaytestJson<PlaytestLegalTargetsRequest, PlaytestLegalTargetsResult>(
      c,
      workerBase,
      "/game/v1/legal-targets",
    ),
  );
  app.post("/game/v1/apply", (c) =>
    proxyPlaytestJson<PlaytestApplyRequest, PlaytestApplyResult>(
      c,
      workerBase,
      "/game/v1/apply",
    ),
  );
}
