import type { CardDef, CardId, MaterialId } from "./types";

export const CARDS: Record<string, CardDef> = {
  brick: {
    id: "brick",
    name: "Fire Brick",
    short: "Brick",
    kind: "brick",
    cost: 9,
    element: "fire",
  },
  arthur: {
    id: "arthur",
    name: "Arthur, Young Heir",
    short: "Arthu",
    kind: "ally",
    cost: 4,
    element: "fire",
    power: 2,
    life: 3,
    unique: true,
  },
  kingdom_informant: {
    id: "kingdom_informant",
    name: "Kingdom Informant",
    short: "Kingd",
    kind: "ally",
    cost: 2,
    element: "norm",
    power: 1,
    life: 2,
    stealth: true,
    floatingMemory: true,
  },
  clumsy_apprentice: {
    id: "clumsy_apprentice",
    name: "Clumsy Apprentice",
    short: "Clums",
    kind: "ally",
    cost: 2,
    element: "fire",
    power: 1,
    life: 1,
  },
  sable_remnant: {
    id: "sable_remnant",
    name: "Sable Remnant",
    short: "Sable",
    kind: "ally",
    cost: 2,
    element: "norm",
    power: 1,
    life: 1,
    floatingMemory: true,
    assassinPowerBonus: 1,
  },
  hasty_messenger: {
    id: "hasty_messenger",
    name: "Hasty Messenger",
    short: "Hasty",
    kind: "ally",
    cost: 2,
    element: "fire",
    power: 1,
    life: 2,
  },
  red_hare: {
    id: "red_hare",
    name: "Red Hare, Unrivaled Stallion",
    short: "Red H",
    kind: "ally",
    cost: 2,
    element: "fire",
    power: 3,
    life: 3,
    unique: true,
  },
  ignited_stab: {
    id: "ignited_stab",
    name: "Ignited Stab",
    short: "Ignit",
    kind: "attack",
    cost: 1,
    element: "fire",
    power: 2,
  },
  rending_flames: {
    id: "rending_flames",
    name: "Rending Flames",
    short: "Rendi",
    kind: "attack",
    cost: 3,
    element: "fire",
    power: 3,
  },
  blazing_throw: {
    id: "blazing_throw",
    name: "Blazing Throw",
    short: "Blazi",
    kind: "action",
    cost: 1,
    element: "fire",
  },
  corhazi_courier: {
    id: "corhazi_courier",
    name: "Corhazi Courier",
    short: "Corha",
    kind: "ally",
    cost: 3,
    element: "fire",
    power: 1,
    life: 2,
    stealth: true,
  },
  veteran_blazebearer: {
    id: "veteran_blazebearer",
    name: "Veteran Blazebearer",
    short: "VBlaz",
    kind: "ally",
    cost: 3,
    element: "fire",
    power: 2,
    life: 3,
  },
  sadi: {
    id: "sadi",
    name: "Sadi, Blood Harvester",
    short: "Sadi",
    kind: "ally",
    cost: 3,
    element: "norm",
    power: 2,
    life: 2,
    unique: true,
  },
  captivating_cutthroat: {
    id: "captivating_cutthroat",
    name: "Captivating Cutthroat",
    short: "CaptC",
    kind: "ally",
    cost: 2,
    element: "fire",
    power: 2,
    life: 1,
    assassinPowerBonus: 1,
  },
  dazzling_courtesan: {
    id: "dazzling_courtesan",
    name: "Dazzling Courtesan",
    short: "Dazzl",
    kind: "ally",
    cost: 3,
    element: "fire",
    power: 2,
    life: 2,
    kindle: 3,
  },
  fiery_interference: {
    id: "fiery_interference",
    name: "Fiery Interference",
    short: "FInt",
    kind: "action",
    cost: 2,
    element: "fire",
  },
  heated_vengeance: {
    id: "heated_vengeance",
    name: "Heated Vengeance",
    short: "HeatV",
    kind: "attack",
    cost: 3,
    element: "fire",
    power: 2,
  },
  intensified_pyre: {
    id: "intensified_pyre",
    name: "Intensified Pyre",
    short: "IPyre",
    kind: "action",
    cost: 3,
    element: "fire",
    kindle: 3,
  },
  march_hare: {
    id: "march_hare",
    name: "March Hare, Mottled Host",
    short: "March",
    kind: "ally",
    cost: 1,
    element: "fire",
    power: 1,
    life: 1,
    unique: true,
  },
  mark_the_target: {
    id: "mark_the_target",
    name: "Mark the Target",
    short: "MarkT",
    kind: "action",
    cost: 1,
    element: "fire",
  },
  peppered_chef: {
    id: "peppered_chef",
    name: "Peppered Chef",
    short: "PChef",
    kind: "ally",
    cost: 2,
    element: "fire",
    power: 2,
    life: 1,
  },
  planted_explosive: {
    id: "planted_explosive",
    name: "Planted Explosive",
    short: "PExpl",
    kind: "action",
    cost: 2,
    element: "fire",
    prepare: 1,
  },
  rococo: {
    id: "rococo",
    name: "Rococo, Explosive Maven",
    short: "Rococ",
    kind: "ally",
    cost: 1,
    element: "fire",
    power: 1,
    life: 1,
    unique: true,
    automaton: true,
  },
  tweedledum: {
    id: "tweedledum",
    name: "Tweedledum, Rattled Dancer",
    short: "Tweed",
    kind: "ally",
    cost: 3,
    element: "fire",
    power: 3,
    life: 2,
    unique: true,
    assassinStealth: true,
  },
  vermilion_decree: {
    id: "vermilion_decree",
    name: "Vermilion Decree",
    short: "VermD",
    kind: "action",
    cost: 3,
    element: "fire",
  },
  xiao_qiao: {
    id: "xiao_qiao",
    name: "Xiao Qiao, Cinderkeeper",
    short: "XiaoQ",
    kind: "ally",
    cost: 2,
    element: "fire",
    power: 1,
    life: 2,
    unique: true,
    stealth: true,
  },
  hot_cake: {
    id: "hot_cake",
    name: "Hot Cake",
    short: "HCake",
    kind: "item",
    cost: 3,
    element: "fire",
    floatingMemory: true,
  },
  uncanny_realization: {
    id: "uncanny_realization",
    name: "Uncanny Realization",
    short: "UReal",
    kind: "attack",
    cost: 1,
    element: "norm",
    power: 3,
  },
  virgil: {
    id: "virgil",
    name: "Virgil, Altered Future",
    short: "Virgi",
    kind: "ally",
    cost: 3,
    element: "norm",
    power: 2,
    life: 2,
    unique: true,
    automaton: true,
    fast: true,
  },
  vicious_slice: {
    id: "vicious_slice",
    name: "Vicious Slice",
    short: "VSlic",
    kind: "attack",
    cost: 1,
    element: "norm",
    power: 2,
  },
  manic_zealot: {
    id: "manic_zealot",
    name: "Manic Zealot",
    short: "Manic",
    kind: "ally",
    cost: 2,
    element: "fire",
    power: 1,
    life: 1,
    automaton: true,
  },
  demolition: {
    id: "demolition",
    name: "Demolition",
    short: "Demol",
    kind: "action",
    cost: 3,
    element: "fire",
    fast: true,
  },
  surging_bolt: {
    id: "surging_bolt",
    name: "Surging Bolt",
    short: "SBolt",
    kind: "action",
    cost: 3,
    element: "fire",
  },
  woodland_squirrels: {
    id: "woodland_squirrels",
    name: "Woodland Squirrels",
    short: "Sqrls",
    kind: "ally",
    cost: 0,
    element: "norm",
    power: 1,
    life: 1,
  },
  duchess_six_of_hearts: {
    id: "duchess_six_of_hearts",
    name: "Duchess, Six of Hearts",
    short: "Duc6H",
    kind: "ally",
    cost: 6,
    element: "fire",
    power: 4,
    life: 2,
    unique: true,
    kindle: 6,
  },
  wandering_glaivier: {
    id: "wandering_glaivier",
    name: "Wandering Glaivier",
    short: "WGlaiv",
    kind: "ally",
    cost: 3,
    element: "fire",
    power: 2,
    life: 1,
  },
  flagrant_guide: {
    id: "flagrant_guide",
    name: "Flagrant Guide",
    short: "FGuid",
    kind: "ally",
    cost: 3,
    element: "fire",
    power: 1,
    life: 3,
  },
  gildas: {
    id: "gildas",
    name: "Gildas, Chronicler of Aesa",
    short: "Gilda",
    kind: "ally",
    cost: 3,
    element: "norm",
    power: 1,
    life: 3,
    unique: true,
  },
  incapacitate: {
    id: "incapacitate",
    name: "Incapacitate",
    short: "Incap",
    kind: "action",
    cost: 4,
    element: "norm",
    fast: true,
  },
  lurking_assailant: {
    id: "lurking_assailant",
    name: "Lurking Assailant",
    short: "Lurki",
    kind: "ally",
    cost: 3,
    element: "norm",
    power: 2,
    life: 3,
  },
  undeniable_truth: {
    id: "undeniable_truth",
    name: "Undeniable Truth",
    short: "Unden",
    kind: "action",
    cost: 1,
    element: "norm",
    fast: true,
  },
  corhazi_arsonist: {
    id: "corhazi_arsonist",
    name: "Corhazi Arsonist",
    short: "Arson",
    kind: "ally",
    cost: 3,
    element: "fire",
    power: 2,
    life: 2,
  },
  ignite_fate: {
    id: "ignite_fate",
    name: "Ignite Fate",
    short: "IFate",
    kind: "action",
    cost: 3,
    element: "fire",
    floatingMemory: true,
  },
  increasing_danger: {
    id: "increasing_danger",
    name: "Increasing Danger",
    short: "IDang",
    kind: "action",
    cost: 2,
    element: "fire",
  },
  reduce_to_ash: {
    id: "reduce_to_ash",
    name: "Reduce to Ash",
    short: "RtAsh",
    kind: "action",
    cost: 3,
    element: "fire",
    fast: true,
  },
  smoke_out: {
    id: "smoke_out",
    name: "Smoke Out",
    short: "Smoke",
    kind: "action",
    cost: 1,
    element: "fire",
    fast: true,
  },
  spark_alight: {
    id: "spark_alight",
    name: "Spark Alight",
    short: "Spark",
    kind: "action",
    cost: 2,
    element: "fire",
    fast: true,
  },
  package_courier: {
    id: "package_courier",
    name: "Package Courier",
    short: "PCour",
    kind: "ally",
    cost: 2,
    element: "fire",
    power: 1,
    life: 3,
  },
  flurry_of_fire: {
    id: "flurry_of_fire",
    name: "Aenean Flurry of Fire",
    short: "Flurr",
    kind: "action",
    cost: 2,
    element: "fire",
    aliases: ["aenean_flurry_of_fire"],
  },
  creative_shock: {
    id: "creative_shock",
    name: "Creative Shock",
    short: "Shock",
    kind: "action",
    cost: 3,
    element: "fire",
    fast: true,
  },
};

export let CARD_LIST: CardDef[] = Object.values(CARDS);

export const MATERIAL_NAMES: Record<MaterialId, string> = {
  impact_hammer: "Impact Hammer",
  mercenary_blade: "Mercenary's Blade",
  poisoned_dagger: "Poisoned Dagger",
  zander_1: "Zander, Prepared Scout",
  zander_2: "Zander, Deft Executor",
  spirit_of_fire: "Spirit of Fire",
  varuckan_soulknife: "Varuckan Soulknife",
  tristan_1: "Tristan, Underhanded",
  assassins_ripper: "Assassin's Ripper",
  grand_crusaders_ring: "Grand Crusader's Ring",
};

export const ALL_MATERIAL_IDS: MaterialId[] = [
  "impact_hammer",
  "mercenary_blade",
  "poisoned_dagger",
  "zander_1",
  "zander_2",
  "varuckan_soulknife",
  "tristan_1",
  "assassins_ripper",
  "grand_crusaders_ring",
];

export const DEFAULT_MATERIALS: MaterialId[] = [
  "impact_hammer",
  "mercenary_blade",
  "poisoned_dagger",
  "zander_1",
  "varuckan_soulknife",
];

export function isMaterialId(id: string): id is MaterialId {
  return (ALL_MATERIAL_IDS as readonly string[]).includes(id);
}

export function isPlayableDeckCard(card: CardDef): boolean {
  return card.id !== "brick" && card.kind !== "material";
}

export function cardDisplayName(id: string): string {
  if (isMaterialId(id)) {
    return CARDS[id]?.name ?? MATERIAL_NAMES[id];
  }
  return CARDS[id]?.name ?? id;
}

export let PLAYABLE_CARD_IDS: CardId[] = CARD_LIST.filter(
  isPlayableDeckCard,
).map((c) => c.id);

export function replaceCardCatalog(cards: CardDef[]): void {
  if (cards.length === 0) {
    return;
  }
  for (const key of Object.keys(CARDS)) {
    delete CARDS[key as CardId];
  }
  for (const card of cards) {
    CARDS[card.id] = card;
  }
  CARD_LIST = Object.values(CARDS);
  PLAYABLE_CARD_IDS = CARD_LIST.filter(isPlayableDeckCard).map((card) => card.id);
}

export function shortName(id: CardId): string {
  return CARDS[id]?.short ?? id;
}

export function parseCardToken(token: string): CardId | null {
  const raw = token.trim().toLowerCase();
  if (!raw) return null;
  const t = raw.replace(/[^a-z0-9]+/g, "_");
  if (t in CARDS) {
    const card = CARDS[t];
    if (card?.kind === "material") return null;
    return t as CardId;
  }
  for (const card of CARD_LIST) {
    if (card.kind === "material") continue;
    if (card.aliases?.some((alias) => alias === t)) {
      return card.id;
    }
    if (
      card.short.toLowerCase() === raw ||
      card.name.toLowerCase() === raw ||
      card.id.replace(/_/g, " ") === raw
    ) {
      return card.id;
    }
  }
  const fallback = FALLBACK_ALIASES[t];
  if (fallback && fallback in CARDS) {
    return fallback;
  }
  return null;
}

const FALLBACK_ALIASES: Record<string, CardId> = {
  fire_brick: "brick",
  arthur_young_heir: "arthur",
  red_hare_unrivaled_stallion: "red_hare",
  kurhazi_courier: "corhazi_courier",
  sadi_blood_harvester: "sadi",
  march_hare_mottled_host: "march_hare",
  rococo_explosive_maven: "rococo",
  tweedledum_rattled_dancer: "tweedledum",
  xiao_qiao_cinderkeeper: "xiao_qiao",
  virgil_altered_future: "virgil",
  gildas_chronicler_of_aesa: "gildas",
  aenean_flurry_of_fire: "flurry_of_fire",
};

/** Minimum recognized maindeck size for a valid saved deck. */
export const MIN_VALID_DECK_SIZE = 60;

function isIgnorableDeckLine(trimmed: string): boolean {
  if (!trimmed || trimmed.startsWith("#")) {
    return true;
  }
  return /^(materials?|main\s*deck|maindeck|sideboard|side\s*board)\b/i.test(
    trimmed,
  );
}

/** Parse a decklist / hand line like "3 Arthur, Young Heir" or "arthur arthur". */
export function parseCardLine(line: string): CardId[] {
  const trimmed = line.trim();
  if (isIgnorableDeckLine(trimmed)) {
    return [];
  }

  // Accept: "4× Name", "4x Name", "4xName", "4 Name"
  // Do not treat the leading X in names like "Xiao Qiao" as a multiplier.
  const countMatch =
    trimmed.match(/^(\d+)\s*×\s*(.+)$/) ||
    trimmed.match(/^(\d+)x\s*(.+)$/i) ||
    trimmed.match(/^(\d+)\s+(.+)$/);
  if (countMatch) {
    const n = Math.min(60, parseInt(countMatch[1], 10));
    const id = parseCardToken(countMatch[2]);
    if (!id) return [];
    return Array(n).fill(id);
  }

  const id = parseCardToken(trimmed);
  return id ? [id] : [];
}

export interface DecklistAnalysis {
  cards: CardId[];
  unrecognizedLines: string[];
  recognizedCount: number;
}

/** Parse a decklist and surface lines that do not map to known cards. */
export function analyzeDecklist(text: string): DecklistAnalysis {
  const cards: CardId[] = [];
  const unrecognizedLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (isIgnorableDeckLine(trimmed)) {
      continue;
    }
    const parsed = parseCardLine(line);
    if (parsed.length === 0) {
      unrecognizedLines.push(trimmed);
    } else {
      cards.push(...parsed);
    }
  }
  return {
    cards,
    unrecognizedLines,
    recognizedCount: cards.length,
  };
}

export function parseDecklist(text: string): CardId[] {
  return analyzeDecklist(text).cards;
}

export type MaterialParseIssue =
  | { kind: "unrecognized"; line: string }
  | { kind: "not_material"; line: string; cardId: string }
  | { kind: "too_many_copies"; line: string; cardId: string; qty: number }
  | { kind: "empty" };

function parseMaterialToken(token: string): MaterialId | null {
  const raw = token.trim().toLowerCase();
  if (!raw) return null;
  const t = raw.replace(/[^a-z0-9]+/g, "_");
  for (const card of CARD_LIST) {
    if (card.kind !== "material") continue;
    if (card.id === t || card.id.replace(/_/g, " ") === raw) {
      return card.id as MaterialId;
    }
    if (
      card.short.toLowerCase() === raw ||
      card.name.toLowerCase() === raw ||
      card.aliases?.some((alias) => alias === t)
    ) {
      return card.id as MaterialId;
    }
  }
  for (const id of ALL_MATERIAL_IDS) {
    const name = MATERIAL_NAMES[id];
    if (
      id === t ||
      id.replace(/_/g, " ") === raw ||
      name.toLowerCase() === raw ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, "_") === t
    ) {
      return id;
    }
  }
  return null;
}

function parseNonMaterialToken(token: string): CardId | null {
  const id = parseCardToken(token);
  return id;
}

export function analyzeMaterialDecklist(text: string): {
  cards: MaterialId[];
  unrecognizedLines: string[];
  issues: string[];
  recognizedCount: number;
} {
  const cards: MaterialId[] = [];
  const unrecognizedLines: string[] = [];
  const issues: string[] = [];
  const counts = new Map<MaterialId, number>();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (isIgnorableDeckLine(trimmed)) {
      continue;
    }

    let qty = 1;
    let token = trimmed;
    const countMatch =
      trimmed.match(/^(\d+)\s*×\s*(.+)$/) ||
      trimmed.match(/^(\d+)x\s*(.+)$/i) ||
      trimmed.match(/^(\d+)\s+(.+)$/);
    if (countMatch) {
      qty = parseInt(countMatch[1], 10);
      token = countMatch[2];
    }

    const materialId = parseMaterialToken(token);
    if (materialId) {
      if (qty > 1) {
        issues.push(`Material decks allow at most 1 copy: ${trimmed}`);
        continue;
      }
      const next = (counts.get(materialId) ?? 0) + qty;
      if (next > 1) {
        issues.push(`Material decks allow at most 1 copy: ${trimmed}`);
        continue;
      }
      counts.set(materialId, next);
      cards.push(materialId);
      continue;
    }

    const other = parseNonMaterialToken(token);
    if (other) {
      issues.push(`Not a material card: ${trimmed}`);
    } else {
      unrecognizedLines.push(trimmed);
      issues.push(`Unrecognized material: ${trimmed}`);
    }
  }

  if (cards.length === 0 && issues.length === 0) {
    issues.push("Material deck needs at least one recognized material card.");
  }

  return {
    cards,
    unrecognizedLines,
    issues,
    recognizedCount: cards.length,
  };
}

export function parseMaterialDecklist(text: string): MaterialId[] {
  return analyzeMaterialDecklist(text).cards;
}

export function materialDeckCounts(
  cards: MaterialId[],
): Record<MaterialId, number> {
  const counts: Partial<Record<MaterialId, number>> = {};
  for (const id of cards) {
    counts[id] = 1;
  }
  return counts as Record<MaterialId, number>;
}
