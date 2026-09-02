import type { CardId, LineEvent } from "@/lib/engine";
import { parseCardToken } from "@/lib/engine";
import {
  LINE_TAPE_PAYLOAD_MARKER,
  goFirstFromEvents,
  openingHandFromEvents,
  turnsFromEvents,
  type LineTapePayload,
} from "./export-line-tape";
import type { CatalogEntry } from "./format-line-event";

export const MAX_IMPORTED_HAND = 8;

export type ImportedLine = {
  hand: CardId[];
  goFirst: boolean;
  turns: 2 | 3;
  damage: number | null;
  events: LineEvent[];
  label: string | null;
};

export type ParseLineTapeResult =
  | { ok: true; line: ImportedLine }
  | { ok: false; error: string };

const TAPE_ROW = /^\d{2}\s*\|/;
const HAND_ZONE = /^HAND(\d+)(?:\s+(.*))?$/;
const START_DRAW = /Start of Game \(draw (.+?)\)\s*$/;
const DAMAGE_HEADER = /^Damage:\s+(\d+)\s*$/;

export function clampSolverTurns(turns: number): 2 | 3 {
  return turns <= 2 ? 2 : 3;
}

function resolveCardToken(
  token: string,
  catalog: CatalogEntry[],
): CardId | null {
  const raw = token.trim();
  if (!raw) {
    return null;
  }
  const byShort = catalog.find(
    (card) => card.short.toLowerCase() === raw.toLowerCase(),
  );
  if (byShort) {
    return byShort.id as CardId;
  }
  if (catalog.some((card) => card.id === raw)) {
    return raw as CardId;
  }
  return parseCardToken(raw);
}

function asCardIds(
  values: string[],
  catalog: CatalogEntry[],
): { cards: CardId[]; error?: string } {
  const cards: CardId[] = [];
  const unknown: string[] = [];
  for (const value of values) {
    const id = resolveCardToken(value, catalog);
    if (!id) {
      unknown.push(value);
    } else {
      cards.push(id);
    }
  }
  if (unknown.length > 0) {
    return { cards: [], error: `Unknown cards: ${unknown.join(", ")}.` };
  }
  if (cards.length === 0) {
    return { cards: [], error: "This line has no opening hand." };
  }
  if (cards.length > MAX_IMPORTED_HAND) {
    return {
      cards: [],
      error: `Opening hand has ${cards.length} cards. The solver takes at most ${MAX_IMPORTED_HAND}.`,
    };
  }
  return { cards };
}

function isLineEvent(value: unknown): value is LineEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    typeof event.kind === "string" &&
    typeof event.turn === "number" &&
    typeof event.damage === "number" &&
    typeof event.phase === "string"
  );
}

function parsePayload(
  value: unknown,
  catalog: CatalogEntry[],
): ParseLineTapeResult {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Line payload is not a JSON object." };
  }
  const data = value as Partial<LineTapePayload> & { version?: unknown };
  if (data.version !== 1) {
    return {
      ok: false,
      error:
        data.version == null
          ? "Line payload is missing a version."
          : "This line export is from a newer Fireline than this app.",
    };
  }

  const events = Array.isArray(data.events)
    ? data.events.filter(isLineEvent)
    : [];
  if (Array.isArray(data.events) && events.length !== data.events.length) {
    return { ok: false, error: "Line payload events are not valid." };
  }

  const rawHand =
    Array.isArray(data.hand) &&
    data.hand.length > 0 &&
    data.hand.every((id) => typeof id === "string")
      ? data.hand
      : openingHandFromEvents(events);
  const resolved = asCardIds(rawHand, catalog);
  if (resolved.error) {
    return { ok: false, error: resolved.error };
  }

  const goFirst =
    typeof data.goFirst === "boolean" ? data.goFirst : goFirstFromEvents(events);
  const turns = clampSolverTurns(
    typeof data.turns === "number" ? data.turns : turnsFromEvents(events),
  );
  const damage =
    typeof data.damage === "number"
      ? data.damage
      : (events.at(-1)?.damage ?? null);

  return {
    ok: true,
    line: {
      hand: resolved.cards,
      goFirst,
      turns,
      damage,
      events,
      label: typeof data.label === "string" ? data.label : null,
    },
  };
}

function parseHandZone(
  zone: string,
  catalog: CatalogEntry[],
): { cards: string[]; error?: string } {
  const match = zone.trim().match(HAND_ZONE);
  if (!match) {
    return { cards: [], error: "No HAND zone on this row." };
  }
  const count = Number(match[1]);
  const rest = match[2]?.trim() ?? "";
  if (count === 0) {
    return { cards: [] };
  }
  const tokens = rest
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length !== count) {
    return {
      cards: [],
      error: `HAND says ${count} cards, found ${tokens.length}.`,
    };
  }
  return { cards: tokens };
}

function parseTextTape(
  text: string,
  catalog: CatalogEntry[],
): ParseLineTapeResult {
  const lines = text.split(/\r?\n/);
  let label: string | null = null;
  let damage: number | null = null;
  let handTokens: string[] | null = null;
  let goFirst = true;
  let lastTurn = 1;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const damageMatch = line.match(DAMAGE_HEADER);
    if (damageMatch) {
      damage = Number(damageMatch[1]);
      continue;
    }
    if (!TAPE_ROW.test(line)) {
      if (!label && line !== LINE_TAPE_PAYLOAD_MARKER) {
        label = line;
      }
      continue;
    }

    const fields = line.split(" | ").map((field) => field.trim());
    const turnMatch = fields[1]?.match(/^(\d+)/);
    if (turnMatch) {
      lastTurn = Number(turnMatch[1]);
    }

    const action = fields[5] ?? "";
    const drawMatch = action.match(START_DRAW);
    if (drawMatch?.[1]) {
      goFirst = false;
    }

    const handField = fields[7];
    if (handField && handTokens == null && HAND_ZONE.test(handField)) {
      const parsed = parseHandZone(handField, catalog);
      if (parsed.error) {
        return { ok: false, error: parsed.error };
      }
      handTokens = parsed.cards;
      if (drawMatch?.[1] && handTokens.length > 0) {
        const drawnId = resolveCardToken(drawMatch[1], catalog);
        if (drawnId) {
          const drawnAt = handTokens.findIndex(
            (token) => resolveCardToken(token, catalog) === drawnId,
          );
          if (drawnAt >= 0) {
            handTokens = handTokens.filter((_, index) => index !== drawnAt);
          }
        }
      }
    }
  }

  if (!handTokens) {
    return { ok: false, error: "This tape has no opening hand." };
  }

  const resolved = asCardIds(handTokens, catalog);
  if (resolved.error) {
    return { ok: false, error: resolved.error };
  }

  return {
    ok: true,
    line: {
      hand: resolved.cards,
      goFirst,
      turns: clampSolverTurns(lastTurn),
      damage,
      events: [],
      label,
    },
  };
}

export function parseLineTape(
  text: string,
  catalog: CatalogEntry[],
): ParseLineTapeResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Nothing to import." };
  }

  if (trimmed.startsWith("{")) {
    try {
      return parsePayload(JSON.parse(trimmed), catalog);
    } catch {
      return { ok: false, error: "Line JSON is not valid." };
    }
  }

  const markerAt = trimmed.lastIndexOf(LINE_TAPE_PAYLOAD_MARKER);
  if (markerAt !== -1) {
    const raw = trimmed.slice(markerAt + LINE_TAPE_PAYLOAD_MARKER.length).trim();
    if (!raw) {
      return { ok: false, error: "Line payload is empty." };
    }
    try {
      return parsePayload(JSON.parse(raw), catalog);
    } catch {
      return { ok: false, error: "Line payload JSON is not valid." };
    }
  }

  return parseTextTape(trimmed, catalog);
}
