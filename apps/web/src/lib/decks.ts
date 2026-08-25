export interface SavedDeck {
  id: string;
  name: string;
  text: string;
}

export interface DeckStore {
  version: 1;
  decks: SavedDeck[];
  activeDeckId: string;
}

const STORAGE_KEY = "fireline-decks-v1";

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

function generateDeckId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function normalizeDeckName(name: string, fallback = "Untitled deck"): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function createDeck(name: string, text = ""): SavedDeck {
  return {
    id: generateDeckId(),
    name: normalizeDeckName(name),
    text,
  };
}

export function createDefaultStore(): DeckStore {
  const deck = createDeck("Sample deck", DEFAULT_SAMPLE_DECK_TEXT);
  return {
    version: 1,
    decks: [deck],
    activeDeckId: deck.id,
  };
}

function isSavedDeck(value: unknown): value is SavedDeck {
  if (!value || typeof value !== "object") return false;
  const deck = value as SavedDeck;
  return (
    typeof deck.id === "string" &&
    typeof deck.name === "string" &&
    typeof deck.text === "string"
  );
}

function parseDeckStore(raw: string): DeckStore | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DeckStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.decks)) {
      return null;
    }

    const decks = parsed.decks.filter(isSavedDeck).map((deck) => ({
      id: deck.id,
      name: normalizeDeckName(deck.name),
      text: deck.text,
    }));

    if (decks.length === 0) {
      return null;
    }

    const activeDeckId =
      typeof parsed.activeDeckId === "string" &&
      decks.some((deck) => deck.id === parsed.activeDeckId)
        ? parsed.activeDeckId
        : decks[0].id;

    return {
      version: 1,
      decks,
      activeDeckId,
    };
  } catch {
    return null;
  }
}

export function loadDeckStore(): DeckStore {
  if (typeof window === "undefined") {
    return createDefaultStore();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultStore();
  }

  return parseDeckStore(raw) ?? createDefaultStore();
}

export function saveDeckStore(store: DeckStore): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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
