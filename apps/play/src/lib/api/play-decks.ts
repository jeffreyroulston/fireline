/** Must include next.config basePath so rewrites match `/play/api/*`. */
const API_PREFIX = "/play/api";

async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  if (!body) {
    return `Request failed (${response.status})`;
  }
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      message?: string;
      linkedDecks?: Array<{ id: string; name: string }>;
    };
    if (parsed.linkedDecks && parsed.linkedDecks.length > 0) {
      const names = parsed.linkedDecks.map((deck) => deck.name).join(", ");
      return `${parsed.error ?? "Conflict."} Linked: ${names}`;
    }
    return parsed.error ?? parsed.message ?? body;
  } catch {
    return body;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
}

export type PlayDeck = Readonly<{
  id: string;
  name: string;
  text: string;
  materialDeckId: string;
}>;

export type PlayMaterialDeck = Readonly<{
  id: string;
  name: string;
  text: string;
  isSystem: boolean;
  deckCount: number;
}>;

interface ApiPlayDeckRow {
  id: string;
  name: string;
  text: string;
  material_deck_id?: string;
}

interface ApiPlayMaterialDeckRow {
  id: string;
  name: string;
  text: string;
  is_system?: boolean;
  deck_count?: number;
}

function mapDeck(row: ApiPlayDeckRow): PlayDeck {
  return {
    id: row.id,
    name: row.name.trim() || "Untitled deck",
    text: row.text,
    materialDeckId: row.material_deck_id ?? "",
  };
}

function mapMaterialDeck(row: ApiPlayMaterialDeckRow): PlayMaterialDeck {
  return {
    id: row.id,
    name: row.name.trim() || "Untitled materials",
    text: row.text,
    isSystem: Boolean(row.is_system),
    deckCount: Number(row.deck_count ?? 0),
  };
}

export async function fetchPlayDecks(): Promise<PlayDeck[]> {
  const response = await apiFetch("/play-decks");
  const rows = (await response.json()) as ApiPlayDeckRow[];
  return rows.map(mapDeck);
}

export async function fetchPlayMaterialDecks(): Promise<PlayMaterialDeck[]> {
  const response = await apiFetch("/play-material-decks");
  const rows = (await response.json()) as ApiPlayMaterialDeckRow[];
  return rows.map(mapMaterialDeck);
}

export async function createPlayDeck(input: {
  name?: string;
  text?: string;
  materialDeckId?: string;
}): Promise<PlayDeck> {
  const response = await apiFetch("/play-decks", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      text: input.text ?? "",
      materialDeckId: input.materialDeckId,
    }),
  });
  return mapDeck((await response.json()) as ApiPlayDeckRow);
}

export async function updatePlayDeck(
  id: string,
  input: { name?: string; text?: string; materialDeckId?: string },
): Promise<PlayDeck> {
  const response = await apiFetch(`/play-decks/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return mapDeck((await response.json()) as ApiPlayDeckRow);
}

export async function deletePlayDeck(id: string): Promise<void> {
  await apiFetch(`/play-decks/${id}`, { method: "DELETE" });
}

export async function createPlayMaterialDeck(input: {
  name?: string;
  text: string;
}): Promise<PlayMaterialDeck> {
  const response = await apiFetch("/play-material-decks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapMaterialDeck((await response.json()) as ApiPlayMaterialDeckRow);
}

export async function updatePlayMaterialDeck(
  id: string,
  input: { name?: string; text?: string },
): Promise<PlayMaterialDeck> {
  const response = await apiFetch(`/play-material-decks/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return mapMaterialDeck((await response.json()) as ApiPlayMaterialDeckRow);
}

export async function deletePlayMaterialDeck(id: string): Promise<void> {
  await apiFetch(`/play-material-decks/${id}`, { method: "DELETE" });
}

export const DEFAULT_MATERIAL_DECK_TEXT = `1 Impact Hammer
1 Mercenary's Blade
1 Poisoned Dagger
1 Zander, Prepared Scout
1 Varuckan Soulknife`;

export function nextDeckName(decks: ReadonlyArray<{ name: string }>): string {
  const base = "Untitled deck";
  if (!decks.some((deck) => deck.name === base)) return base;
  let n = 2;
  while (decks.some((deck) => deck.name === `${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function nextMaterialDeckName(
  decks: ReadonlyArray<{ name: string }>,
  preferred = "Untitled material deck",
): string {
  if (!decks.some((deck) => deck.name === preferred)) return preferred;
  let n = 2;
  while (decks.some((deck) => deck.name === `${preferred} ${n}`)) n += 1;
  return `${preferred} ${n}`;
}
