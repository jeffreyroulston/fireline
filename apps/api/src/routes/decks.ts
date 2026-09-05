import type { Hono } from "hono";
import { sql } from "kysely";
import { catalogTokenIndex, deckHash, newId, parseDeckText } from "../lib/deck.js";
import {
  formatMaterialParseIssues,
  materialCountsHash,
  parseAndValidateMaterialDeck,
} from "../lib/material-deck.js";
import { toJsonb } from "../lib/jsonb.js";
import { getCards, replaceDeckCards } from "../services/card-catalog.js";
import type { AppDeps } from "./types.js";

/** Shared deck + material-deck CRUD (play reads; workbench writes). */
export function registerDeckRoutes(app: Hono, options: AppDeps): void {
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

}
