import type { Hono } from "hono";
import { stream, streamSSE } from "hono/streaming";
import { sql } from "kysely";
import type { SolveRequest, SolveResult } from "@ga-fire/contracts";
import { deckHash, newId } from "../lib/deck.js";
import { toJsonb } from "../lib/jsonb.js";
import { loadEventsBySampleId } from "../lib/load-sample-events.js";
import { parseAttributionVersion, parseDamageBounds, parseVersionTriple } from "../lib/version.js";
import { parseRunSettingsFilter } from "../lib/run-settings-filter.js";
import { getCards } from "../services/card-catalog.js";
import { persistSolveResult } from "../services/persist.js";
import { runHub, sseJson } from "../services/run-hub.js";
import {
  checkWorkerReachable,
  fetchWorkerHealth,
  WorkerError,
} from "../services/worker.js";
import { proxyWorkerStream } from "../services/worker-stream.js";
import {
  cardLeaderboard,
  getPooledSample,
  listRunHistory,
  listVersionGroups,
  pooledDamageDistribution,
  pooledSampleHighlights,
  rankedCandidates,
} from "../services/analysis.js";
import {
  cardDatabase,
  cardDatabaseCardDecks,
  cardDatabasePairings,
  cardDatabasePlayMatrix,
  type CardDatabaseSource,
} from "../services/card-database.js";
import type { AppDeps } from "./types.js";

function parseCardDatabaseSource(value: string | null): CardDatabaseSource {
  if (value === "all" || value === "swap_sweep") {
    return value;
  }
  return "evaluate";
}

/** Simulator / workbench: solve, runs, analysis. */
export function registerWorkbenchRoutes(app: Hono, options: AppDeps): void {
  async function loadMaterialDeckCounts(
    materialDeckId: string,
  ): Promise<Record<string, number>> {
    const row = await options.db
      .selectFrom("material_decks")
      .select("counts")
      .where("id", "=", materialDeckId)
      .executeTakeFirst();
    if (!row) {
      throw new Error("Material deck not found.");
    }
    return row.counts;
  }

  app.post("/solve", async (c) => {
    const body = await c.req.json<SolveRequest>();
    c.header("Content-Type", "application/x-ndjson");
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");
    return stream(c, async (streamWriter) => {
      try {
        await proxyWorkerStream(
          {
            workerBase: options.workerBase,
            path: "/solve",
            body,
            signal: c.req.raw.signal,
            onEvent: async (event) => {
              if (event.kind !== "result") {
                return event as unknown as Record<string, unknown>;
              }
              const { kind, ...result } = event as { kind: string } & SolveResult;
              const { sampleId } = await persistSolveResult(
                options.db,
                body,
                result as SolveResult,
              );
              return { kind, ...result, sampleId };
            },
          },
          async (line) => {
            await streamWriter.write(line);
          },
        );
      } catch (error) {
        if (error instanceof WorkerError) {
          await streamWriter.write(
            `${JSON.stringify({ kind: "error", message: error.message })}\n`,
          );
          return;
        }
        throw error;
      }
    });
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

  app.get("/runs/queue", async (c) => {
    const workerHealth = await fetchWorkerHealth(options.workerBase);
    const workerReachable = workerHealth?.ok ?? false;
    const cpuCount = workerHealth?.cpuCount ?? 1;
    const liveRows = await options.db
      .selectFrom("runs")
      .selectAll()
      .where("status", "in", ["queued", "running"])
      .where("kind", "in", ["evaluate", "optimize"])
      .orderBy("started_at", "asc")
      .execute();

    const finishedRows = await options.db
      .selectFrom("runs")
      .selectAll()
      .where("status", "in", ["complete", "partial", "failed", "interrupted", "cancelled"])
      .where("kind", "in", ["evaluate", "optimize"])
      .orderBy("completed_at", "desc")
      .limit(8)
      .execute();

    const deckIds = [
      ...new Set(
        [...liveRows, ...finishedRows]
          .map((row) => row.deck_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const deckRows =
      deckIds.length > 0
        ? await options.db
            .selectFrom("decks")
            .select(["id", "name"])
            .where("id", "in", deckIds)
            .execute()
        : [];
    const deckNames = new Map(deckRows.map((deck) => [deck.id, deck.name]));

    const toItem = (run: (typeof liveRows)[number]) => ({
      run,
      deckName: (run.deck_id && deckNames.get(run.deck_id)) || "Deck",
    });

    return c.json({
      workerReachable,
      cpuCount,
      maxConcurrency: options.maxConcurrency,
      running: liveRows.filter((row) => row.status === "running").map(toItem),
      queued: liveRows.filter((row) => row.status === "queued").map(toItem),
      finished: finishedRows.map(toItem),
    });
  });

  // Backward-compatible alias for older clients.
  app.get("/runs/active", async (c) => {
    const workerReachable = await checkWorkerReachable(options.workerBase);
    const active = await options.db
      .selectFrom("runs")
      .selectAll()
      .where("status", "in", ["queued", "running"])
      .orderBy("started_at", "desc")
      .executeTakeFirst();
    if (active) {
      const deck = active.deck_id
        ? await options.db
            .selectFrom("decks")
            .select(["name"])
            .where("id", "=", active.deck_id)
            .executeTakeFirst()
        : null;
      return c.json({ run: active, deckName: deck?.name ?? null, workerReachable });
    }
    return c.json({ run: null, deckName: null, workerReachable });
  });

  app.get("/analysis/groups", async (c) => {
    const deckHash = c.req.query("deck_hash") || undefined;
    const deckId = c.req.query("deck_id") || undefined;
    const simType = c.req.query("sim_type") || undefined;
    const kind = c.req.query("kind");
    const params = new URL(c.req.url).searchParams;
    const groups = await listVersionGroups(options.db, {
      deckHash,
      deckId,
      simType,
      kind:
        kind === "evaluate" || kind === "optimize" ? kind : undefined,
      runSettings: parseRunSettingsFilter(params),
    });
    return c.json(groups);
  });

  app.get("/analysis/pooled-sample-highlights", async (c) => {
    const deckHash = c.req.query("deck_hash") || undefined;
    const deckId = c.req.query("deck_id") || undefined;
    const simType = c.req.query("sim_type");
    if ((!deckHash && !deckId) || !simType) {
      return c.json(
        { error: "sim_type and either deck_id or deck_hash are required" },
        400,
      );
    }
    const version = parseVersionTriple(new URL(c.req.url).searchParams);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const params = new URL(c.req.url).searchParams;
    const result = await pooledSampleHighlights(options.db, {
      deckHash,
      deckId,
      simType,
      version,
      runSettings: parseRunSettingsFilter(params),
    });
    return c.json(result);
  });

  app.get("/analysis/pooled-sample", async (c) => {
    const runId = c.req.query("run_id");
    const sampleIndexRaw = c.req.query("sample_index");
    if (!runId || sampleIndexRaw == null || sampleIndexRaw === "") {
      return c.json({ error: "run_id and sample_index are required" }, 400);
    }
    const sampleIndex = Number.parseInt(sampleIndexRaw, 10);
    if (!Number.isFinite(sampleIndex) || sampleIndex < 0) {
      return c.json({ error: "sample_index must be a non-negative integer" }, 400);
    }
    const sample = await getPooledSample(options.db, { runId, sampleIndex });
    if (!sample) {
      return c.notFound();
    }
    return c.json(sample);
  });

  app.get("/analysis/pooled-damage", async (c) => {
    const deckHash = c.req.query("deck_hash") || undefined;
    const deckId = c.req.query("deck_id") || undefined;
    const simType = c.req.query("sim_type");
    if ((!deckHash && !deckId) || !simType) {
      return c.json(
        { error: "sim_type and either deck_id or deck_hash are required" },
        400,
      );
    }
    const version = parseVersionTriple(new URL(c.req.url).searchParams);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const params = new URL(c.req.url).searchParams;
    const result = await pooledDamageDistribution(options.db, {
      deckHash,
      deckId,
      simType,
      version,
      runSettings: parseRunSettingsFilter(params),
    });
    return c.json(result);
  });

  app.get("/analysis/card-leaderboard", async (c) => {
    const deckHash = c.req.query("deck_hash") || undefined;
    const deckId = c.req.query("deck_id") || undefined;
    const simType = c.req.query("sim_type");
    if ((!deckHash && !deckId) || !simType) {
      return c.json(
        { error: "sim_type and either deck_id or deck_hash are required" },
        400,
      );
    }
    const params = new URL(c.req.url).searchParams;
    const version = parseVersionTriple(params);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const attributionVersion = parseAttributionVersion(params);
    if (typeof attributionVersion === "object" && "error" in attributionVersion) {
      return c.json({ error: attributionVersion.error }, 400);
    }
    const bounds = parseDamageBounds(params);
    if ("error" in bounds) {
      return c.json({ error: bounds.error }, 400);
    }
    const filtered =
      bounds.gt != null ||
      bounds.gte != null ||
      bounds.lt != null ||
      bounds.lte != null;
    const cards = filtered ? await getCards(options.db) : undefined;
    const result = await cardLeaderboard(options.db, {
      deckHash,
      deckId,
      simType,
      version,
      attributionVersion,
      bounds,
      cards,
      runSettings: parseRunSettingsFilter(params),
    });
    return c.json(result);
  });

  app.get("/analysis/card-database", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const source = parseCardDatabaseSource(params.get("source"));
    const simType = c.req.query("sim_type");
    if (!simType) {
      return c.json({ error: "sim_type is required" }, 400);
    }
    const version = parseVersionTriple(params);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const attributionVersion = parseAttributionVersion(params);
    if (typeof attributionVersion === "object" && "error" in attributionVersion) {
      return c.json({ error: attributionVersion.error }, 400);
    }
    const currentRules = params.get("current_rules_version");
    const currentSampler = params.get("current_sampler_version");
    const currentAttrRaw = params.get("current_attribution_version");
    if (!currentRules || !currentSampler || !currentAttrRaw) {
      return c.json(
        {
          error:
            "current_rules_version, current_sampler_version, and current_attribution_version are required",
        },
        400,
      );
    }
    const currentVersion = {
      rulesVersion: Number(currentRules),
      samplerVersion: Number(currentSampler),
    };
    const currentAttributionVersion = Number(currentAttrRaw);
    if (
      !Number.isInteger(currentVersion.rulesVersion) ||
      !Number.isInteger(currentVersion.samplerVersion) ||
      !Number.isInteger(currentAttributionVersion)
    ) {
      return c.json({ error: "current engine version fields must be integers" }, 400);
    }
    const deckIdParams = params.getAll("deck_id").filter(Boolean);
    const deckFilter = params.get("deck_filter") === "1";
    const result = await cardDatabase(options.db, {
      source,
      simType,
      version,
      attributionVersion,
      currentVersion,
      currentAttributionVersion,
      deckIds: deckFilter ? deckIdParams : undefined,
      runSettings: parseRunSettingsFilter(params),
    });
    return c.json(result);
  });

  app.get("/analysis/card-database/:cardId/decks", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const source = parseCardDatabaseSource(params.get("source"));
    const cardId = c.req.param("cardId");
    const simType = c.req.query("sim_type");
    if (!simType) {
      return c.json({ error: "sim_type is required" }, 400);
    }
    const version = parseVersionTriple(params);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const attributionVersion = parseAttributionVersion(params);
    if (typeof attributionVersion === "object" && "error" in attributionVersion) {
      return c.json({ error: attributionVersion.error }, 400);
    }
    const deckIdParams = params.getAll("deck_id").filter(Boolean);
    const deckFilter = params.get("deck_filter") === "1";
    const decks = await cardDatabaseCardDecks(options.db, {
      source,
      cardId,
      simType,
      version,
      attributionVersion,
      deckIds: deckFilter ? deckIdParams : undefined,
      runSettings: parseRunSettingsFilter(params),
    });
    return c.json({ decks });
  });

  app.get("/analysis/card-database/:cardId/play-matrix", async (c) => {
    const simType = c.req.query("sim_type");
    if (!simType) {
      return c.json({ error: "sim_type is required" }, 400);
    }
    const params = new URL(c.req.url).searchParams;
    const source = parseCardDatabaseSource(params.get("source"));
    const version = parseVersionTriple(params);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const attributionVersion = parseAttributionVersion(params);
    if (typeof attributionVersion === "object" && "error" in attributionVersion) {
      return c.json({ error: attributionVersion.error }, 400);
    }
    const deckIdParams = params.getAll("deck_id").filter(Boolean);
    const deckFilter = params.get("deck_filter") === "1";
    const matrix = await cardDatabasePlayMatrix(options.db, {
      source,
      cardId: c.req.param("cardId"),
      simType,
      version,
      attributionVersion,
      deckIds: deckFilter ? deckIdParams : undefined,
      runSettings: parseRunSettingsFilter(params),
    });
    return c.json(matrix);
  });

  app.get("/analysis/card-database/:cardId/pairings", async (c) => {
    const simType = c.req.query("sim_type");
    if (!simType) {
      return c.json({ error: "sim_type is required" }, 400);
    }
    const params = new URL(c.req.url).searchParams;
    const source = parseCardDatabaseSource(params.get("source"));
    const version = parseVersionTriple(params);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const attributionVersion = parseAttributionVersion(params);
    if (typeof attributionVersion === "object" && "error" in attributionVersion) {
      return c.json({ error: attributionVersion.error }, 400);
    }
    const deckIdParams = params.getAll("deck_id").filter(Boolean);
    const deckFilter = params.get("deck_filter") === "1";
    const pairings = await cardDatabasePairings(options.db, {
      source,
      cardId: c.req.param("cardId"),
      simType,
      version,
      attributionVersion,
      deckIds: deckFilter ? deckIdParams : undefined,
      runSettings: parseRunSettingsFilter(params),
    });
    return c.json(pairings);
  });

  app.get("/analysis/candidates", async (c) => {
    const version = parseVersionTriple(new URL(c.req.url).searchParams);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const deckHash = c.req.query("deck_hash") || undefined;
    const deckId = c.req.query("deck_id") || undefined;
    const result = await rankedCandidates(options.db, {
      version,
      deckId,
      deckHash,
    });
    return c.json(result);
  });

  app.get("/analysis/history", async (c) => {
    const deckHash = c.req.query("deck_hash") || undefined;
    const deckId = c.req.query("deck_id") || undefined;
    const kind = c.req.query("kind");
    const rows = await listRunHistory(options.db, {
      deckHash,
      deckId,
      kind:
        kind === "evaluate" || kind === "optimize" ? kind : undefined,
      limit: 200,
    });
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
    const eventsBySample = await loadEventsBySampleId(
      options.db,
      samples.map((sample) => sample.id),
    );
    const samplesWithEvents = samples.map((sample) => ({
      ...sample,
      events: eventsBySample.get(sample.id) ?? [],
    }));
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

    return c.json({ run, samples: samplesWithEvents, cardStats, candidates });
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

    if (!body.deckId) {
      return c.json({ error: "deckId is required for evaluate and optimize" }, 400);
    }

    const deck = await options.db
      .selectFrom("decks")
      .select(["counts", "deck_hash", "material_deck_id"])
      .where("id", "=", body.deckId)
      .executeTakeFirst();
    if (!deck) return c.json({ error: "deck not found" }, 404);
    const deckCounts = deck.counts;
    const materialCounts = await loadMaterialDeckCounts(deck.material_deck_id);
    const payload = {
      ...body.payload,
      materials: materialCounts,
    };

    const runId = newId();
    await options.db
      .insertInto("runs")
      .values({
        id: runId,
        kind: body.kind,
        status: "queued",
        deck_id: body.deckId,
        material_deck_id: deck.material_deck_id,
        deck_counts: toJsonb(deckCounts),
        deck_hash: deckHash(deckCounts),
        request_body: toJsonb(payload),
        started_at: new Date(),
      })
      .execute();

    runHub.register(runId);
    options.dispatcher.enqueue({
      runId,
      kind: body.kind,
      body: payload,
    });

    return c.json({ id: runId, status: "queued" }, 202);
  });

  app.get("/runs/:id/events", (c) => {
    const runId = c.req.param("id");
    c.header("Cache-Control", "no-cache, no-transform");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      let done = false;
      let wake = () => {};
      const write = async (event: unknown) => {
        try {
          await stream.writeSSE({ data: sseJson(event) });
        } catch {
          done = true;
          wake();
          return;
        }
        const type = (event as { type?: unknown }).type;
        if (type === "complete" || type === "error" || type === "cancelled") {
          done = true;
        }
        wake();
      };

      const pending: Promise<void>[] = [];
      const unsubscribe = runHub.subscribe(runId, (event: unknown) => {
        pending.push(write(event));
      });

      stream.onAbort(() => {
        done = true;
        unsubscribe();
        wake();
      });

      while (!done) {
        while (pending.length > 0) {
          await pending.shift();
        }
        if (done) {
          break;
        }
        await stream.write(": keep-alive\n\n");
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 15_000);
        });
      }
      unsubscribe();
    });
  });

  app.delete("/runs/:id", async (c) => {
    const runId = c.req.param("id");
    options.dispatcher.cancel(runId);
    await options.db.deleteFrom("runs").where("id", "=", runId).execute();
    return c.body(null, 204);
  });

  app.post("/runs/:id/save", async (c) => {
    const runId = c.req.param("id");
    const outcome = options.dispatcher.requestSave(runId);
    if (outcome === "queued") {
      await options.db.deleteFrom("runs").where("id", "=", runId).execute();
      runHub.publish(runId, { type: "cancelled" });
      return c.body(null, 204);
    }
    return c.json({ status: "stopping" }, 202);
  });

}
