/** Must include next.config basePath so rewrites match `/play/api/*`. */
const API_PREFIX = "/play/api";

async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  if (!body) {
    return `Request failed (${response.status})`;
  }
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? body;
  } catch {
    return body;
  }
}

async function apiFetch(path: string): Promise<Response> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response;
}

export type SavedDeckRow = Readonly<{
  id: string;
  name: string;
  text: string;
  materialDeckId: string;
}>;

export type SavedMaterialDeckRow = Readonly<{
  id: string;
  name: string;
  text: string;
}>;

interface ApiDeckRow {
  id: string;
  name: string;
  text: string;
  material_deck_id?: string;
}

interface ApiMaterialDeckRow {
  id: string;
  name: string;
  text: string;
}

export async function fetchSavedDecks(): Promise<SavedDeckRow[]> {
  const response = await apiFetch("/decks");
  const rows = (await response.json()) as ApiDeckRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name.trim() || "Untitled deck",
    text: row.text,
    materialDeckId: row.material_deck_id ?? "",
  }));
}

export async function fetchSavedMaterialDecks(): Promise<
  SavedMaterialDeckRow[]
> {
  const response = await apiFetch("/material-decks");
  const rows = (await response.json()) as ApiMaterialDeckRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name.trim() || "Untitled materials",
    text: row.text,
  }));
}
