import type { CardDef, CardId, MaterialId } from "./types";
import {
  BUNDLED_CARD_DIGEST,
  GENERATED_CARDS,
  GENERATED_FALLBACK_ALIASES,
} from "./generated/catalog-data";

export { BUNDLED_CARD_DIGEST };

/** Mutable catalog — hydrated from API when engine digest drifts from the bundle. */
export const CARDS: Record<string, CardDef> = {
  ...(GENERATED_CARDS as Record<string, CardDef>),
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
  aithne_spirit_of_fire: "Aithne, Spirit of Fire",
  hanabi_spirit_of_fire: "Hanabi, Spirit of Fire",
  vyra_spirit_of_fire: "Vyra, Spirit of Fire",
  rai_spellcrafter: "Rai, Spellcrafter",
  rai_archmage: "Rai, Archmage",
  rai_mana_weaver: "Rai, Mana Weaver",
  rai_storm_seer: "Rai, Storm Seer",
  kongming_wayward_maven: "Kongming, Wayward Maven",
  kongming_erudite_strategist: "Kongming, Erudite Strategist",
  kongming_ascetic_vice: "Kongming, Ascetic Vice",
  dante_prodigal_swain: "Dante, Prodigal Swain",
  dante_aenean_initiate: "Dante, Aenean Initiate",
  dante_hemomancer: "Dante, Hemomancer",
  dante_hematic_overdrive: "Dante, Hematic Overdrive",
  tonoris_lone_mercenary: "Tonoris, Lone Mercenary",
  tonoris_might_of_humanity: "Tonoris, Might of Humanity",
  tonoris_genesis_aegis: "Tonoris, Genesis Aegis",
  tonoris_creations_will: "Tonoris, Creation's Will",
  backup_charger: "Backup Charger",
  cell_reactor: "Cell Reactor",
  mercurial_heart: "Mercurial Heart",
  synthetic_core: "Synthetic Core",
  deployment_beacon: "Deployment Beacon",
  sentinel_fabricator: "Sentinel Fabricator",
  worn_gearblade: "Worn Gearblade",
  reciprocity_dorumegias_call: "Reciprocity, Dorumegia's Call",
  synth_disrupter: "Synth Disrupter",
  aegis_of_dawn: "Aegis of Dawn",
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
  "spirit_of_fire",
  "aithne_spirit_of_fire",
  "hanabi_spirit_of_fire",
  "vyra_spirit_of_fire",
  "rai_spellcrafter",
  "rai_archmage",
  "rai_mana_weaver",
  "rai_storm_seer",
  "kongming_wayward_maven",
  "kongming_erudite_strategist",
  "kongming_ascetic_vice",
  "dante_prodigal_swain",
  "dante_aenean_initiate",
  "dante_hemomancer",
  "dante_hematic_overdrive",
  "tonoris_lone_mercenary",
  "tonoris_might_of_humanity",
  "tonoris_genesis_aegis",
  "tonoris_creations_will",
  "backup_charger",
  "cell_reactor",
  "mercurial_heart",
  "synthetic_core",
  "deployment_beacon",
  "sentinel_fabricator",
  "worn_gearblade",
  "reciprocity_dorumegias_call",
  "synth_disrupter",
  "aegis_of_dawn",
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

/** True when GET /version `cardDigest` differs from the sync-time bundle. */
export function catalogDigestMismatch(
  engineCardDigest: string | null | undefined,
): boolean {
  if (engineCardDigest == null || engineCardDigest === "") {
    return false;
  }
  return String(engineCardDigest) !== BUNDLED_CARD_DIGEST;
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

const FALLBACK_ALIASES: Record<string, CardId> = GENERATED_FALLBACK_ALIASES;

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
