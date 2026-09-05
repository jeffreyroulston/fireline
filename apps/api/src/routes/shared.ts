import type { Hono } from "hono";
import type { EngineVersion } from "@ga-fire/contracts";
import { getCard, getCards, listDecksForCard } from "../services/card-catalog.js";
import { fetchWorkerJson, WorkerError } from "../services/worker.js";
import type { AppDeps } from "./types.js";

/** Meta + catalog reads — usable by play and workbench. */
export function registerSharedRoutes(app: Hono, options: AppDeps): void {
  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/version", async (c) => {
    try {
      const version = await fetchWorkerJson<EngineVersion>(
        options.workerBase,
        "/version",
      );
      return c.json({
        ...version,
        cardDigest: String(version.cardDigest),
      });
    } catch (error) {
      if (error instanceof WorkerError) {
        return c.json(
          { error: error.message },
          (error.status === 503 ? 503 : 502) as 502 | 503,
        );
      }
      throw error;
    }
  });

  app.get("/cards", async (c) => {
    const cards = await getCards(options.db);
    return c.json(cards);
  });

  app.get("/cards/:id", async (c) => {
    const card = await getCard(options.db, c.req.param("id"));
    if (!card) return c.notFound();
    const decks = await listDecksForCard(options.db, card.id);
    return c.json({ ...card, decks });
  });
}
