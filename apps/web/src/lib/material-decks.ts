import {
  createMaterialDeckOnApi,
  deleteMaterialDeckOnApi,
  fetchMaterialDecks,
  updateMaterialDeckOnApi,
} from "./api/client";

export interface SavedMaterialDeck {
  id: string;
  name: string;
  text: string;
  materialHash: string;
  isSystem: boolean;
  deckCount: number;
  runCount: number;
}

export interface MaterialDeckDeleteError extends Error {
  linkedDecks?: Array<{ id: string; name: string; locked: boolean }>;
}

interface ApiMaterialDeckRow {
  id: string;
  name: string;
  text: string;
  material_hash: string;
  is_system?: boolean;
  deck_count?: number;
  run_count?: number;
}

export const DEFAULT_MATERIAL_DECK_TEXT = `1 Impact Hammer
1 Mercenary's Blade
1 Poisoned Dagger
1 Zander, Prepared Scout
1 Varuckan Soulknife`;

function rowToSavedMaterialDeck(row: ApiMaterialDeckRow): SavedMaterialDeck {
  return {
    id: row.id,
    name: normalizeMaterialDeckName(row.name),
    text: row.text,
    materialHash: row.material_hash,
    isSystem: Boolean(row.is_system),
    deckCount: Number(row.deck_count ?? 0),
    runCount: Number(row.run_count ?? 0),
  };
}

export function normalizeMaterialDeckName(
  name: string,
  fallback = "Untitled material deck",
): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function loadMaterialDecksFromApi(): Promise<SavedMaterialDeck[]> {
  const rows = (await fetchMaterialDecks()) as ApiMaterialDeckRow[];
  return rows.map(rowToSavedMaterialDeck);
}

export async function createMaterialDeckRemote(
  name: string,
  text: string,
): Promise<SavedMaterialDeck> {
  const row = (await createMaterialDeckOnApi(name, text)) as ApiMaterialDeckRow;
  return rowToSavedMaterialDeck(row);
}

export async function renameMaterialDeckRemote(
  id: string,
  name: string,
): Promise<SavedMaterialDeck> {
  const row = (await updateMaterialDeckOnApi(id, { name })) as ApiMaterialDeckRow;
  return rowToSavedMaterialDeck(row);
}

export async function deleteMaterialDeckRemote(id: string): Promise<void> {
  await deleteMaterialDeckOnApi(id);
}

export function nextMaterialDeckName(
  decks: SavedMaterialDeck[],
  preferred?: string,
): string {
  const used = new Set(decks.map((deck) => deck.name.toLowerCase()));
  if (preferred) {
    const base = normalizeMaterialDeckName(preferred);
    if (!used.has(base.toLowerCase())) {
      return base;
    }
    let suffix = 2;
    while (used.has(`${base} (${suffix})`.toLowerCase())) {
      suffix += 1;
    }
    return `${base} (${suffix})`;
  }
  let index = decks.length + 1;
  while (used.has(`material deck ${index}`)) {
    index += 1;
  }
  return `Material deck ${index}`;
}

export function formatMaterialDeckDeleteError(
  error: unknown,
): string {
  if (!(error instanceof Error)) {
    return "Could not delete the material deck.";
  }
  const linked = (error as MaterialDeckDeleteError).linkedDecks;
  if (linked && linked.length > 0) {
    const names = linked
      .map((deck) => `${deck.name}${deck.locked ? " (locked)" : ""}`)
      .join(", ");
    return `Cannot delete this material deck — it is linked to: ${names}.`;
  }
  return error.message;
}

export function isMaterialDeckDeletable(deck: SavedMaterialDeck): boolean {
  return !deck.isSystem && deck.deckCount === 0 && deck.runCount === 0;
}
