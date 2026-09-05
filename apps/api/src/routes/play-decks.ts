import type { Hono } from "hono";
import { sql } from "kysely";
import { catalogTokenIndex, deckHash, newId, parseDeckText } from "../lib/deck.js";
import {
  formatMaterialParseIssues,
  materialCountsHash,
  parseAndValidateMaterialDeck,
} from "../lib/material-deck.js";
import { toJsonb } from "../lib/jsonb.js";
import { getCards } from "../services/card-catalog.js";
import type { AppDeps } from "./types.js";

/** Play-app deck CRUD — separate tables from workbench/sim decks. */
export function registerPlayDeckRoutes(app: Hono, options: AppDeps): void {
  const materialDeckRefCount = sql<number>`(
    select count(*)::int from play_decks
    where play_decks.material_deck_id = play_material_decks.id
  )`;

  async function getStandardPlayMaterialDeckId(): Promise<string> {
    const row = await options.db
      .selectFrom("play_material_decks")
      .select("id")
      .where("is_system", "=", true)
      .executeTakeFirst();
    if (!row) {
      throw new Error("Standard play materials preset is missing.");
    }
    return row.id;
  }

  app.get("/play-decks", async (c) => {
    const rows = await options.db
      .selectFrom("play_decks")
      .selectAll("play_decks")
      .orderBy("updated_at", "desc")
      .execute();
    return c.json(rows);
  });

  app.get("/play-decks/:id", async (c) => {
    const row = await options.db
      .selectFrom("play_decks")
      .selectAll("play_decks")
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!row) return c.notFound();
    return c.json(row);
  });

  app.post("/play-decks", async (c) => {
    const body = await c.req.json<{
      name?: string;
      text?: string;
      materialDeckId?: string;
    }>();
    const text = body.text ?? "";
    const catalog = await getCards(options.db);
    const counts = parseDeckText(text, catalogTokenIndex(catalog));
    const materialDeckId =
      body.materialDeckId ?? (await getStandardPlayMaterialDeckId());
    const materialExists = await options.db
      .selectFrom("play_material_decks")
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
      text,
      counts: toJsonb(counts),
      deck_hash: deckHash(counts),
      material_deck_id: materialDeckId,
      created_at: now,
      updated_at: now,
    };
    await options.db.insertInto("play_decks").values(row).execute();
    return c.json({ ...row, counts }, 201);
  });

  app.put("/play-decks/:id", async (c) => {
    const body = await c.req.json<{
      name?: string;
      text?: string;
      materialDeckId?: string;
    }>();
    const existing = await options.db
      .selectFrom("play_decks")
      .selectAll()
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!existing) return c.notFound();

    if (body.materialDeckId !== undefined) {
      const materialExists = await options.db
        .selectFrom("play_material_decks")
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
    await options.db
      .updateTable("play_decks")
      .set(row)
      .where("id", "=", existing.id)
      .execute();
    return c.json({ ...existing, ...row, counts });
  });

  app.delete("/play-decks/:id", async (c) => {
    const result = await options.db
      .deleteFrom("play_decks")
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!result.numDeletedRows) return c.notFound();
    return c.body(null, 204);
  });

  app.get("/play-material-decks", async (c) => {
    const rows = await options.db
      .selectFrom("play_material_decks")
      .selectAll("play_material_decks")
      .select(materialDeckRefCount.as("deck_count"))
      .orderBy("updated_at", "desc")
      .execute();
    return c.json(rows);
  });

  app.get("/play-material-decks/:id", async (c) => {
    const row = await options.db
      .selectFrom("play_material_decks")
      .selectAll("play_material_decks")
      .select(materialDeckRefCount.as("deck_count"))
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!row) return c.notFound();
    return c.json(row);
  });

  app.post("/play-material-decks", async (c) => {
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
    await options.db.insertInto("play_material_decks").values(row).execute();
    return c.json({ ...row, counts, deck_count: 0 }, 201);
  });

  app.put("/play-material-decks/:id", async (c) => {
    const body = await c.req.json<{ name?: string; text?: string }>();
    const existing = await options.db
      .selectFrom("play_material_decks")
      .selectAll()
      .where("id", "=", c.req.param("id"))
      .executeTakeFirst();
    if (!existing) return c.notFound();

    if (existing.is_system && body.text !== undefined) {
      return c.json(
        { error: "The Standard materials preset card list cannot be edited." },
        409,
      );
    }

    let counts = existing.counts;
    let text = existing.text;
    let materialHash = existing.material_hash;

    if (body.text !== undefined) {
      const catalog = await getCards(options.db);
      const parsed = parseAndValidateMaterialDeck(body.text, catalog);
      const blocking = parsed.issues.filter(
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
      text = body.text;
      counts = parsed.counts;
      materialHash = materialCountsHash(parsed.counts);
    }

    const row = {
      name: body.name?.trim() || existing.name,
      text,
      counts: toJsonb(counts),
      material_hash: materialHash,
      updated_at: new Date(),
    };
    await options.db
      .updateTable("play_material_decks")
      .set(row)
      .where("id", "=", existing.id)
      .execute();

    const deckCountRow = await options.db
      .selectFrom("play_decks")
      .select(sql<number>`count(*)::int`.as("deck_count"))
      .where("material_deck_id", "=", existing.id)
      .executeTakeFirst();

    return c.json({
      ...existing,
      ...row,
      counts,
      deck_count: deckCountRow?.deck_count ?? 0,
    });
  });

  app.delete("/play-material-decks/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await options.db
      .selectFrom("play_material_decks")
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
      .selectFrom("play_decks")
      .select(["id", "name"])
      .where("material_deck_id", "=", id)
      .execute();

    if (linkedDecks.length > 0) {
      return c.json(
        {
          error: "Material deck is linked to play decks. Reassign them first.",
          linkedDecks,
        },
        409,
      );
    }

    const result = await options.db
      .deleteFrom("play_material_decks")
      .where("id", "=", id)
      .executeTakeFirst();
    if (!result.numDeletedRows) return c.notFound();
    return c.body(null, 204);
  });
}
