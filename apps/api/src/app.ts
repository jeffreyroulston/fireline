import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { sql, type Kysely } from "kysely";
import type { EngineVersion, SolveRequest, SolveResult } from "@ga-fire/contracts";
import type { Database } from "./db/types.js";
import { catalogTokenIndex, deckHash, newId, parseDeckText } from "./lib/deck.js";
import {
  formatMaterialParseIssues,
  materialCountsHash,
  parseAndValidateMaterialDeck,
} from "./lib/material-deck.js";
import { toJsonb } from "./lib/jsonb.js";
import { loadEventsBySampleId } from "./lib/load-sample-events.js";
import { getCard, getCards, listDecksForCard, replaceDeckCards } from "./services/card-catalog.js";
import type { RunDispatcher } from "./services/dispatch.js";
import { persistSolveResult } from "./services/persist.js";
import { runHub, sseJson } from "./services/run-hub.js";
import { fetchWorkerJson, WorkerError, checkWorkerReachable } from "./services/worker.js";
import {
  cardLeaderboard,
  getPooledSample,
  listRunHistory,
  listVersionGroups,
  pooledDamageDistribution,
  pooledSampleHighlights,
  rankedCandidates,
} from "./services/analysis.js";
import {
  cardDatabase,
  cardDatabaseCardDecks,
  cardDatabasePairings,
  cardDatabasePlayMatrix,
} from "./services/card-database.js";
import {
  cardDatabaseSwapSweep,
  cardDatabaseSwapSweepCardRuns,
} from "./services/card-database-swap-sweep.js";
import { parseAttributionVersion, parseDamageBounds, parseVersionTriple } from "./lib/version.js";

export function createApp(options: {
  db: Kysely<Database>;
  workerBase: string;
  dispatcher: RunDispatcher;
  maxConcurrency: number;
}) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/version", async (c) => {
    try {
      const version = await fetchWorkerJson<EngineVersion>(options.workerBase, "/version");
      return c.json({
        ...version,
        cardDigest: String(version.cardDigest),
      });
    } catch (error) {
      if (error instanceof WorkerError) {
        return c.json({ error: error.message }, (error.status === 503 ? 503 : 502) as 502 | 503);
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

  app.post("/solve", async (c) => {
    const body = await c.req.json<SolveRequest>();
    try {
      const result = await fetchWorkerJson<SolveResult>(options.workerBase, "/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { sampleId } = await persistSolveResult(options.db, body, result);
      return c.json({ ...result, sampleId });
    } catch (error) {
      if (error instanceof WorkerError) {
        return c.json({ error: error.message }, (error.status === 503 ? 503 : 400) as 400 | 503);
      }
      throw error;
    }
  });

  const deckRunCount = sql<number>`(
    select count(*)::int from runs where runs.deck_id = decks.id
  )`;

  const materialDeckRefCount = sql<number>`(
    select count(*)::int from decks where decks.material_deck_id = material_decks.id
  )`;

  const materialDeckRunCount = sql<number>`(
    select count(*)::int from runs where runs.material_deck_id = material_decks.id
  )`;

  async function getStandardMaterialDeckId(): Promise<string> {
    const row = await options.db
      .selectFrom("material_decks")
      .select("id")
      .where("is_system", "=", true)
      .executeTakeFirst();
    if (!row) {
      throw new Error("Standard materials preset is missing.");
    }
    return row.id;
  }

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

  app.get("/decks", async (c) => {
    const rows = await options.db
      .selectFrom("decks")
      .selectAll("decks")
      .select(deckRunCount.as("run_count"))
      .orderBy("updated_at", "desc")
      .execute();
    return c.json(rows);
  });

  app.get("/decks/:id", async (c) => {
    const row = await options.db
      .selectFrom("decks")
      .selectAll("decks")
      .select(deckRunCount.as("run_count"))
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!row) return c.notFound();
    return c.json(row);
  });

  app.post("/decks", async (c) => {
    const body = await c.req.json<{
      name?: string;
      text: string;
      materialDeckId?: string;
    }>();
    const catalog = await getCards(options.db);
    const counts = parseDeckText(body.text, catalogTokenIndex(catalog));
    const materialDeckId =
      body.materialDeckId ?? (await getStandardMaterialDeckId());
    const materialExists = await options.db
      .selectFrom("material_decks")
      .select("id")
      .where("id", "=", materialDeckId)
      .executeTakeFirst();
    if (!materialExists) {
      return c.json({ error: "Material deck not found." }, 404);
    }
    const id = newId();
    const now = new Date();
    const row = {
      id,
      name: body.name?.trim() || "Untitled deck",
      text: body.text,
      counts: toJsonb(counts),
      deck_hash: deckHash(counts),
      material_deck_id: materialDeckId,
      created_at: now,
      updated_at: now,
    };
    await options.db.transaction().execute(async (trx) => {
      await trx.insertInto("decks").values(row).execute();
      await replaceDeckCards(trx, id, counts);
    });
    return c.json({ ...row, counts, run_count: 0 }, 201);
  });

  app.put("/decks/:id", async (c) => {
    const body = await c.req.json<{
      name?: string;
      text?: string;
      materialDeckId?: string;
    }>();
    const existing = await options.db
      .selectFrom("decks")
      .selectAll()
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!existing) return c.notFound();

    const runCountRow = await options.db
      .selectFrom("runs")
      .select(sql<number>`count(*)::int`.as("run_count"))
      .where("deck_id", "=", existing.id)
      .executeTakeFirst();
    const runCount = runCountRow?.run_count ?? 0;

    if (body.text !== undefined && runCount > 0) {
      return c.json(
        {
          error:
            "Cardlist is locked after simulations. Duplicate the deck to edit.",
        },
        409,
      );
    }

    if (body.materialDeckId !== undefined && runCount > 0) {
      return c.json(
        {
          error:
            "Material deck assignment is locked after simulations. Duplicate the deck to change it.",
        },
        409,
      );
    }

    if (body.materialDeckId !== undefined) {
      const materialExists = await options.db
        .selectFrom("material_decks")
        .select("id")
        .where("id", "=", body.materialDeckId)
        .executeTakeFirst();
      if (!materialExists) {
        return c.json({ error: "Material deck not found." }, 404);
      }
    }

    const text = body.text ?? existing.text;
    const catalog = await getCards(options.db);
    const counts = parseDeckText(text, catalogTokenIndex(catalog));
    const row = {
      name: body.name?.trim() || existing.name,
      text,
      counts: toJsonb(counts),
      deck_hash: deckHash(counts),
      material_deck_id: body.materialDeckId ?? existing.material_deck_id,
      updated_at: new Date(),
    };
    await options.db.transaction().execute(async (trx) => {
      await trx.updateTable("decks").set(row).where("id", "=", existing.id).execute();
      await replaceDeckCards(trx, existing.id, counts);
    });
    return c.json({
      ...existing,
      ...row,
      counts,
      run_count: runCount,
    });
  });

  app.delete("/decks/:id", async (c) => {
    const result = await options.db
      .deleteFrom("decks")
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!result.numDeletedRows) return c.notFound();
    return c.body(null, 204);
  });

  app.get("/material-decks", async (c) => {
    const rows = await options.db
      .selectFrom("material_decks")
      .selectAll("material_decks")
      .select(materialDeckRefCount.as("deck_count"))
      .select(materialDeckRunCount.as("run_count"))
      .orderBy("updated_at", "desc")
      .execute();
    return c.json(rows);
  });

  app.get("/material-decks/:id", async (c) => {
    const row = await options.db
      .selectFrom("material_decks")
      .selectAll("material_decks")
      .select(materialDeckRefCount.as("deck_count"))
      .select(materialDeckRunCount.as("run_count"))
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!row) return c.notFound();
    return c.json(row);
  });

  app.post("/material-decks", async (c) => {
    const body = await c.req.json<{ name?: string; text: string }>();
    const catalog = await getCards(options.db);
    const { counts, issues } = parseAndValidateMaterialDeck(body.text, catalog);
    const blocking = issues.filter(
      (issue) =>
        issue.kind === "empty" ||
        issue.kind === "unrecognized" ||
        issue.kind === "not_material" ||
        issue.kind === "too_many_copies",
    );
    if (blocking.length > 0) {
      return c.json(
        { error: formatMaterialParseIssues(blocking).join(" ") },
        400,
      );
    }
    const id = newId();
    const now = new Date();
    const row = {
      id,
      name: body.name?.trim() || "Untitled material deck",
      text: body.text,
      counts: toJsonb(counts),
      material_hash: materialCountsHash(counts),
      is_system: false,
      created_at: now,
      updated_at: now,
    };
    await options.db.insertInto("material_decks").values(row).execute();
    return c.json({ ...row, counts, deck_count: 0, run_count: 0 }, 201);
  });

  app.put("/material-decks/:id", async (c) => {
    const body = await c.req.json<{ name?: string; text?: string }>();
    if (body.text !== undefined) {
      return c.json(
        { error: "Material deck card lists cannot be edited. Duplicate to change cards." },
        409,
      );
    }
    const existing = await options.db
      .selectFrom("material_decks")
      .selectAll()
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!existing) return c.notFound();
    const name = body.name?.trim() || existing.name;
    const row = { name, updated_at: new Date() };
    await options.db
      .updateTable("material_decks")
      .set(row)
      .where("id", "=", existing.id)
      .execute();
    const deckCountRow = await options.db
      .selectFrom("decks")
      .select(sql<number>`count(*)::int`.as("deck_count"))
      .where("material_deck_id", "=", existing.id)
      .executeTakeFirst();
    const runCountRow = await options.db
      .selectFrom("runs")
      .select(sql<number>`count(*)::int`.as("run_count"))
      .where("material_deck_id", "=", existing.id)
      .executeTakeFirst();
    return c.json({
      ...existing,
      ...row,
      deck_count: deckCountRow?.deck_count ?? 0,
      run_count: runCountRow?.run_count ?? 0,
    });
  });

  app.delete("/material-decks/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await options.db
      .selectFrom("material_decks")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!existing) return c.notFound();
    if (existing.is_system) {
      return c.json(
        { error: "The Standard materials preset cannot be deleted." },
        409,
      );
    }

    const linkedDecks = await options.db
      .selectFrom("decks")
      .select([
        "decks.id as id",
        "decks.name as name",
        sql<boolean>`exists(
          select 1 from runs where runs.deck_id = decks.id
        )`.as("locked"),
      ])
      .where("decks.material_deck_id", "=", id)
      .execute();

    const runCountRow = await options.db
      .selectFrom("runs")
      .select(sql<number>`count(*)::int`.as("run_count"))
      .where("material_deck_id", "=", id)
      .executeTakeFirst();
    const runCount = runCountRow?.run_count ?? 0;

    if (linkedDecks.length > 0 || runCount > 0) {
      const linked = linkedDecks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        locked: Boolean(deck.locked),
      }));
      return c.json(
        {
          error: "Material deck is linked to other decks or runs.",
          linkedDecks: linked,
        },
        409,
      );
    }

    const result = await options.db
      .deleteFrom("material_decks")
      .where("id", "=", id)
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

  app.get("/runs/queue", async (c) => {
    const workerReachable = await checkWorkerReachable(options.workerBase);
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
      .where("status", "=", "complete")
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
    const groups = await listVersionGroups(options.db, {
      deckHash,
      deckId,
      simType,
      kind:
        kind === "evaluate" || kind === "optimize" ? kind : undefined,
    });
    return c.json(groups);
  });

  app.get("/analysis/pooled-sample-highlights", async (c) => {
    const deckHash = c.req.query("deck_hash");
    const simType = c.req.query("sim_type");
    if (!deckHash || !simType) {
      return c.json({ error: "deck_hash and sim_type are required" }, 400);
    }
    const version = parseVersionTriple(new URL(c.req.url).searchParams);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const result = await pooledSampleHighlights(options.db, {
      deckHash,
      simType,
      version,
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
    const deckHash = c.req.query("deck_hash");
    const simType = c.req.query("sim_type");
    if (!deckHash || !simType) {
      return c.json({ error: "deck_hash and sim_type are required" }, 400);
    }
    const version = parseVersionTriple(new URL(c.req.url).searchParams);
    if ("error" in version) {
      return c.json({ error: version.error }, 400);
    }
    const result = await pooledDamageDistribution(options.db, {
      deckHash,
      simType,
      version,
    });
    return c.json(result);
  });

  app.get("/analysis/card-leaderboard", async (c) => {
    const deckHash = c.req.query("deck_hash");
    const simType = c.req.query("sim_type");
    if (!deckHash || !simType) {
      return c.json({ error: "deck_hash and sim_type are required" }, 400);
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
      simType,
      version,
      attributionVersion,
      bounds,
      cards,
    });
    return c.json(result);
  });

  app.get("/analysis/card-database", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const source = params.get("source") ?? "evaluate";

    if (source === "swap_sweep") {
      const runIdParams = params.getAll("run_id").filter(Boolean);
      const runFilter = params.get("run_filter") === "1";
      const result = await cardDatabaseSwapSweep(options.db, {
        runIds: runFilter ? runIdParams : undefined,
      });
      return c.json(result);
    }

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
      simType,
      version,
      attributionVersion,
      currentVersion,
      currentAttributionVersion,
      deckIds: deckFilter ? deckIdParams : undefined,
    });
    return c.json(result);
  });

  app.get("/analysis/card-database/:cardId/decks", async (c) => {
    const params = new URL(c.req.url).searchParams;
    const source = params.get("source") ?? "evaluate";
    const cardId = c.req.param("cardId");

    if (source === "swap_sweep") {
      const runIdParams = params.getAll("run_id").filter(Boolean);
      const runFilter = params.get("run_filter") === "1";
      const runs = await cardDatabaseSwapSweepCardRuns(options.db, cardId, {
        runIds: runFilter ? runIdParams : undefined,
      });
      return c.json(runs);
    }

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
      cardId,
      simType,
      version,
      attributionVersion,
      deckIds: deckFilter ? deckIdParams : undefined,
    });
    return c.json({ decks });
  });

  app.get("/analysis/card-database/:cardId/play-matrix", async (c) => {
    const simType = c.req.query("sim_type");
    if (!simType) {
      return c.json({ error: "sim_type is required" }, 400);
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
    const deckIdParams = params.getAll("deck_id").filter(Boolean);
    const deckFilter = params.get("deck_filter") === "1";
    const matrix = await cardDatabasePlayMatrix(options.db, {
      cardId: c.req.param("cardId"),
      simType,
      version,
      attributionVersion,
      deckIds: deckFilter ? deckIdParams : undefined,
    });
    return c.json(matrix);
  });

  app.get("/analysis/card-database/:cardId/pairings", async (c) => {
    const simType = c.req.query("sim_type");
    if (!simType) {
      return c.json({ error: "sim_type is required" }, 400);
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
    const deckIdParams = params.getAll("deck_id").filter(Boolean);
    const deckFilter = params.get("deck_filter") === "1";
    const pairings = await cardDatabasePairings(options.db, {
      cardId: c.req.param("cardId"),
      simType,
      version,
      attributionVersion,
      deckIds: deckFilter ? deckIdParams : undefined,
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

  return app;
}
