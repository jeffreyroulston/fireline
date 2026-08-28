import {
  createDeckOnApi,
  deleteDeckOnApi,
  fetchDecks,
  updateDeckOnApi,
} from "./api/client";

export interface SavedDeck {
  id: string;
  name: string;
  text: string;
  deckHash: string;
  materialDeckId: string;
  /** Count of runs linked via `runs.deck_id` — cardlist locked when > 0. */
  runCount: number;
}

/** Cardlist is locked when the deck has any linked simulation runs. */
export function isDeckCardlistLocked(deck: Pick<SavedDeck, "runCount">): boolean {
  return deck.runCount > 0;
}

const ACTIVE_DECK_KEY = "fireline-active-deck-id";
/** Pre-API browser store from the WASM app. */
const LEGACY_STORE_KEY = "fireline-decks-v1";
const LEGACY_MIGRATED_KEY = "fireline-decks-migrated-v1";

export const DEFAULT_SAMPLE_DECK_TEXT = `4 Sable Remnant
1 Sadi, Blood Harvester
4 Arthur, Young Heir
4 Blazing Throw
2 Captivating Cutthroat
3 Clumsy Apprentice
2 Corhazi Courier
4 Dazzling Courtesan
2 Fiery Interference
2 Hasty Messenger
3 Heated Vengeance
1 Ignited Stab
3 Intensified Pyre
3 Kingdom Informant
4 March Hare, Mottled Host
2 Mark the Target
3 Peppered Chef
3 Planted Explosive
4 Red Hare, Unrivaled Stallion
1 Rending Flames
3 Rococo, Explosive Maven
3 Tweedledum, Rattled Dancer
3 Vermilion Decree
2 Xiao Qiao, Cinderkeeper`;

interface ApiDeckRow {
  id: string;
  name: string;
  text: string;
  deck_hash: string;
  material_deck_id?: string;
  run_count?: number;
}

interface LegacyDeckStore {
  version: 1;
  decks: Array<{ id: string; name: string; text: string }>;
  activeDeckId: string;
}

function rowToSavedDeck(row: ApiDeckRow): SavedDeck {
  return {
    id: row.id,
    name: normalizeDeckName(row.name),
    text: row.text,
    deckHash: row.deck_hash,
    materialDeckId: row.material_deck_id ?? "",
    runCount: Number(row.run_count ?? 0),
  };
}

export function normalizeDeckName(name: string, fallback = "Untitled deck"): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readLegacyLocalStore(): LegacyDeckStore | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(LEGACY_STORE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LegacyDeckStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.decks)) {
      return null;
    }
    const decks = parsed.decks.filter(
      (deck): deck is { id: string; name: string; text: string } =>
        !!deck &&
        typeof deck.id === "string" &&
        typeof deck.name === "string" &&
        typeof deck.text === "string",
    );
    if (decks.length === 0) {
      return null;
    }
    const activeDeckId =
      typeof parsed.activeDeckId === "string" &&
      decks.some((deck) => deck.id === parsed.activeDeckId)
        ? parsed.activeDeckId
        : decks[0].id;
    return { version: 1, decks, activeDeckId };
  } catch {
    return null;
  }
}

/**
 * One-time import of decks from the old `fireline-decks-v1` localStorage key.
 * Returns the legacy active deck name so we can reselect it after API ids change.
 */
async function migrateLegacyLocalDecks(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.localStorage.getItem(LEGACY_MIGRATED_KEY) === "1") {
    return null;
  }

  const legacy = readLegacyLocalStore();
  window.localStorage.setItem(LEGACY_MIGRATED_KEY, "1");
  if (!legacy) {
    return null;
  }

  const existing = ((await fetchDecks()) as ApiDeckRow[]).map(rowToSavedDeck);
  const existingKeys = new Set(
    existing.map((deck) => `${deck.name}\n${deck.text}`),
  );

  let legacyActiveName: string | null = null;
  for (const deck of legacy.decks) {
    const name = normalizeDeckName(deck.name);
    if (deck.id === legacy.activeDeckId) {
      legacyActiveName = name;
    }
    const key = `${name}\n${deck.text}`;
    if (existingKeys.has(key)) {
      continue;
    }
    await createDeckOnApi(name, deck.text);
    existingKeys.add(key);
  }

  return legacyActiveName;
}

export function loadActiveDeckId(decks: SavedDeck[]): string {
  if (typeof window === "undefined") {
    return decks[0]?.id ?? "";
  }
  const stored = window.localStorage.getItem(ACTIVE_DECK_KEY);
  if (stored && decks.some((deck) => deck.id === stored)) {
    return stored;
  }
  return decks[0]?.id ?? "";
}

export function saveActiveDeckId(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACTIVE_DECK_KEY, id);
}

export async function loadDecksFromApi(): Promise<{
  decks: SavedDeck[];
  activeDeckId: string;
}> {
  const legacyActiveName = await migrateLegacyLocalDecks();

  const rows = (await fetchDecks()) as ApiDeckRow[];
  let decks = rows.map(rowToSavedDeck);
  if (decks.length === 0) {
    const created = (await createDeckOnApi(
      "Sample deck",
      DEFAULT_SAMPLE_DECK_TEXT,
    )) as ApiDeckRow;
    decks = [rowToSavedDeck(created)];
  }

  let activeDeckId = loadActiveDeckId(decks);
  if (legacyActiveName) {
    const match = decks.find((deck) => deck.name === legacyActiveName);
    if (match) {
      activeDeckId = match.id;
      saveActiveDeckId(match.id);
    }
  }

  return { decks, activeDeckId };
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDeckSave(
  deck: SavedDeck,
  onSaved?: (saved: SavedDeck) => void,
): () => void {
  const existing = saveTimers.get(deck.id);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    saveTimers.delete(deck.id);
    const patch = isDeckCardlistLocked(deck)
      ? { name: deck.name }
      : {
          name: deck.name,
          text: deck.text,
          materialDeckId: deck.materialDeckId || undefined,
        };
    void updateDeckOnApi(deck.id, patch)
      .then((row) => {
        onSaved?.(rowToSavedDeck(row as ApiDeckRow));
      })
      .catch(() => {});
  }, 400);
  saveTimers.set(deck.id, timer);
  return () => {
    clearTimeout(timer);
    saveTimers.delete(deck.id);
  };
}

export async function createDeckRemote(
  name: string,
  text = "",
  materialDeckId?: string,
): Promise<SavedDeck> {
  const row = (await createDeckOnApi(name, text, materialDeckId)) as ApiDeckRow;
  return rowToSavedDeck(row);
}

export async function refreshDecksRemote(): Promise<SavedDeck[]> {
  const rows = (await fetchDecks()) as ApiDeckRow[];
  return rows.map(rowToSavedDeck);
}

export async function deleteDeckRemote(id: string): Promise<void> {
  await deleteDeckOnApi(id);
}

export function nextDeckName(decks: SavedDeck[], preferred?: string): string {
  const used = new Set(decks.map((deck) => deck.name.toLowerCase()));
  if (preferred) {
    const base = normalizeDeckName(preferred);
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
  while (used.has(`deck ${index}`)) {
    index += 1;
  }
  return `Deck ${index}`;
}
