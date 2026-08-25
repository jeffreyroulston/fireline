import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Kysely } from "kysely";
import type { SolveRequest, SolveResult } from "@ga-fire/contracts";
import type { Database } from "./db/types.js";
import { deckHash, newId, parseDeckText } from "./lib/deck.js";
import { getCards } from "./services/cards-cache.js";
import type { RunDispatcher } from "./services/dispatch.js";
import { markRunCancelled } from "./services/persist.js";
import { runHub } from "./services/run-hub.js";
import { fetchWorkerJson, WorkerError } from "./services/worker.js";

export function createApp(options: {
  db: Kysely<Database>;
  workerBase: string;
  dispatcher: RunDispatcher;
}) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/cards", async (c) => {
    const cards = await getCards(options.workerBase);
    return c.json(cards);
  });

  app.post("/solve", async (c) => {
    const body = await c.req.json<SolveRequest>();
    try {
      const result = await fetchWorkerJson<SolveResult>(options.workerBase, "/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof WorkerError) {
        return c.json({ error: error.message }, (error.status === 503 ? 503 : 400) as 400 | 503);
      }
      throw error;
    }
  });

  app.get("/decks", async (c) => {
    const rows = await options.db
      .selectFrom("decks")
      .selectAll()
      .orderBy("updated_at", "desc")
      .execute();
    return c.json(rows);
  });

  app.get("/decks/:id", async (c) => {
    const row = await options.db
      .selectFrom("decks")
      .selectAll()
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!row) return c.notFound();
    return c.json(row);
  });

  app.post("/decks", async (c) => {
    const body = await c.req.json<{ name?: string; text: string }>();
    const counts = parseDeckText(body.text);
    const id = newId();
    const now = new Date();
    const row = {
      id,
      name: body.name?.trim() || "Untitled deck",
      text: body.text,
      counts,
      deck_hash: deckHash(counts),
      created_at: now,
      updated_at: now,
    };
    await options.db.insertInto("decks").values(row).execute();
    return c.json(row, 201);
  });

  app.put("/decks/:id", async (c) => {
    const body = await c.req.json<{ name?: string; text?: string }>();
    const existing = await options.db
      .selectFrom("decks")
      .selectAll()
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!existing) return c.notFound();

    const text = body.text ?? existing.text;
    const counts = parseDeckText(text);
    const row = {
      name: body.name?.trim() || existing.name,
      text,
      counts,
      deck_hash: deckHash(counts),
      updated_at: new Date(),
    };
    await options.db.updateTable("decks").set(row).where("id", "=", existing.id).execute();
    return c.json({ ...existing, ...row });
  });

  app.delete("/decks/:id", async (c) => {
    const result = await options.db
      .deleteFrom("decks")
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!result.numDeletedRows) return c.notFound();
    return c.body(null, 204);
  });

  app.get("/runs", async (c) => {
    const rows = await options.db
      .selectFrom("runs")
      .selectAll()
      .orderBy("started_at", "desc")
      .limit(100)
      .execute();
    return c.json(rows);
  });

  app.get("/runs/:id", async (c) => {
    const run = await options.db
      .selectFrom("runs")
      .selectAll()
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!run) return c.notFound();

    const samples = await options.db
      .selectFrom("run_samples")
      .selectAll()
      .where("run_id", "=", run.id)
      .execute();
    const cardStats = await options.db
      .selectFrom("run_card_stats")
      .selectAll()
      .where("run_id", "=", run.id)
      .execute();
    const candidates = await options.db
      .selectFrom("run_candidates")
      .selectAll()
      .where("run_id", "=", run.id)
      .orderBy("rank", "asc")
      .execute();

    return c.json({ run, samples, cardStats, candidates });
  });

  app.post("/runs", async (c) => {
    const body = await c.req.json<{
      kind: "evaluate" | "optimize";
      deckId?: string;
      payload: Record<string, unknown>;
    }>();

    if (body.kind !== "evaluate" && body.kind !== "optimize") {
      return c.json({ error: "kind must be evaluate or optimize" }, 400);
    }

    let deckCounts: Record<string, number> = {};
    if (body.deckId) {
      const deck = await options.db
        .selectFrom("decks")
        .select(["counts", "deck_hash"])
        .where("id", "=", body.deckId)
        .executeTakeFirst();
      if (!deck) return c.json({ error: "deck not found" }, 404);
      deckCounts = deck.counts;
    }

    const runId = newId();
    await options.db
      .insertInto("runs")
      .values({
        id: runId,
        kind: body.kind,
        status: "queued",
        deck_id: body.deckId ?? null,
        deck_counts: deckCounts,
        deck_hash: deckHash(deckCounts),
        request_body: body.payload,
        started_at: new Date(),
      })
      .execute();

    options.dispatcher.enqueue({
      runId,
      kind: body.kind,
      body: body.payload,
    });

    return c.json({ id: runId, status: "queued" }, 202);
  });

  app.get("/runs/:id/events", (c) => {
    const runId = c.req.param("id");
    return streamSSE(c, async (stream) => {
      let done = false;
      const unsubscribe = runHub.subscribe(runId, (event: unknown) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });

      const poll = setInterval(async () => {
        const run = await options.db
          .selectFrom("runs")
          .select(["status"])
          .where("id", "=", runId)
          .executeTakeFirst();
        if (!run || (run.status !== "queued" && run.status !== "running")) {
          done = true;
          clearInterval(poll);
        }
      }, 1000);

      stream.onAbort(() => {
        done = true;
        clearInterval(poll);
        unsubscribe();
      });

      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      unsubscribe();
    });
  });

  app.delete("/runs/:id", async (c) => {
    const runId = c.req.param("id");
    options.dispatcher.cancel(runId);
    await markRunCancelled(options.db, runId);
    return c.body(null, 204);
  });

  return app;
}
