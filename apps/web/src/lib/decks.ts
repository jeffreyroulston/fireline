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
}

const ACTIVE_DECK_KEY = "fireline-active-deck-id";

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
}

function rowToSavedDeck(row: ApiDeckRow): SavedDeck {
  return {
    id: row.id,
    name: normalizeDeckName(row.name),
    text: row.text,
    deckHash: row.deck_hash,
  };
}

export function normalizeDeckName(name: string, fallback = "Untitled deck"): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallback;
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
  const rows = (await fetchDecks()) as ApiDeckRow[];
  let decks = rows.map(rowToSavedDeck);
  if (decks.length === 0) {
    const created = (await createDeckOnApi(
      "Sample deck",
      DEFAULT_SAMPLE_DECK_TEXT,
    )) as ApiDeckRow;
    decks = [rowToSavedDeck(created)];
  }
  return {
    decks,
    activeDeckId: loadActiveDeckId(decks),
  };
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDeckSave(deck: SavedDeck): () => void {
  const existing = saveTimers.get(deck.id);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    saveTimers.delete(deck.id);
    void updateDeckOnApi(deck.id, { name: deck.name, text: deck.text }).catch(
      () => {},
    );
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
): Promise<SavedDeck> {
  const row = (await createDeckOnApi(name, text)) as ApiDeckRow;
  return rowToSavedDeck(row);
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
