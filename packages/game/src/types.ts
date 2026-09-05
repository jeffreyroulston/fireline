/** Core types for the FiZa max-damage engine. */

import type { LineEvent } from "@ga-fire/contracts";
export type { LineEvent };

export type CardId = import("./generated/catalog-data").GeneratedCardId;

/** Materials the FiZa engine can materialize (bitmask in Rust state). */
export type EngineMaterialId =
  | "impact_hammer"
  | "mercenary_blade"
  | "poisoned_dagger"
  | "zander_1"
  | "zander_2"
  | "varuckan_soulknife"
  | "tristan_1"
  | "assassins_ripper"
  | "grand_crusaders_ring";

/** All material-deck card ids (deckbuilding / UI), including not-yet-simulated champs/regalia. */
export type MaterialId =
  | EngineMaterialId
  | "spirit_of_fire"
  | "aithne_spirit_of_fire"
  | "hanabi_spirit_of_fire"
  | "vyra_spirit_of_fire"
  | "rai_spellcrafter"
  | "rai_archmage"
  | "rai_mana_weaver"
  | "rai_storm_seer"
  | "kongming_wayward_maven"
  | "kongming_erudite_strategist"
  | "kongming_ascetic_vice"
  | "dante_prodigal_swain"
  | "dante_aenean_initiate"
  | "dante_hemomancer"
  | "dante_hematic_overdrive"
  | "tonoris_lone_mercenary"
  | "tonoris_might_of_humanity"
  | "tonoris_genesis_aegis"
  | "tonoris_creations_will"
  | "backup_charger"
  | "cell_reactor"
  | "mercurial_heart"
  | "synthetic_core"
  | "deployment_beacon"
  | "sentinel_fabricator"
  | "worn_gearblade"
  | "reciprocity_dorumegias_call"
  | "synth_disrupter"
  | "aegis_of_dawn";

export type Phase =
  | "main"
  | "agility"
  | "end"
  | "enemy_main"
  | "wake"
  | "materialize"
  | "recollect";

export type CardKind =
  | "ally"
  | "attack"
  | "action"
  | "item"
  | "brick"
  | "material";

export interface CardDef {
  id: CardId;
  name: string;
  short: string;
  kind: CardKind;
  /** Reserve cost paid from hand into memory. */
  cost: number;
  element: "fire" | "norm";
  power?: number;
  life?: number;
  stealth?: boolean;
  taunt?: boolean;
  trueSight?: boolean;
  unique?: boolean;
  /** Assassin class bonus +power while champion is Assassin. */
  assassinPowerBonus?: number;
  /** Assassin class bonus stealth while champion is Assassin. */
  assassinStealth?: boolean;
  /** Automaton subtype — required for Command Automaton attacks. */
  automaton?: boolean;
  /** Fast activation — playable during pre-recollect (and Agility). */
  fast?: boolean;
  floatingMemory?: boolean;
  kindle?: number;
  prepare?: number;
  tags?: string[];
  /** Extra tokens that parse to this id (full name slugs, misspellings). */
  aliases?: string[];
}

export interface AllyState {
  card: CardId;
  awake: boolean;
  immortal: boolean;
  uid: number;
}

export interface WeaponState {
  id: MaterialId;
  power: number;
  durability: number;
}

export interface GameState {
  turn: number;
  phase: Phase;
  goFirst: boolean;
  maxTurns: number;
  damage: number;
  hand: CardId[];
  memory: CardId[];
  fireGy: number;
  floatGy: number;
  allies: AllyState[];
  championLevel: number;
  championAwake: boolean;
  prep: number;
  agility: number;
  weapon: WeaponState | null;
  poisonedDagger: boolean;
  daggerRested: boolean;
  amplify: boolean;
  materials: MaterialId[];
  nextUid: number;
  materializedThisTurn: boolean;
  log: string[];
}

export interface SolveOptions {
  hand: CardId[];
  goFirst?: boolean;
  maxTurns?: number;
}

export type SimType = "fire_brick" | "monte_carlo" | "two_pass" | "oracle_only";

export interface PassResult {
  maxDamage: number;
  endInfluence: number;
  events: LineEvent[];
  nodes: number;
  memoEntries?: number;
  cardStats?: CardStat[];
}

export interface McRollout {
  damage: number;
  events: LineEvent[];
  nodes: number;
}

export interface DamageDistribution {
  damages: number[];
  mean: number;
  p10?: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  rollouts: McRollout[];
}

export interface TwoPassResult {
  brick: PassResult;
  oracle: PassResult;
}

export interface SolveResult {
  simType: SimType;
  maxDamage: number;
  endInfluence: number;
  events: LineEvent[];
  nodes: number;
  memoEntries?: number;
  elapsedMs?: number;
  /** `run_samples.id` when the API persisted this solve. */
  sampleId?: string | null;
  distribution?: DamageDistribution;
  twoPass?: TwoPassResult;
  cardStats?: CardStat[];
}

export interface CardStat {
  card: string;
  name: string;
  copies: number;
  opened: number;
  openedCopies: number;
  drawn: number;
  seen: number;
  plays: number;
  attacks: number;
  damage: number;
  openRate: number;
  seeRate: number;
  playRate: number;
  playWhenInHand: number;
  damageWhenSeen: number;
  damageWhenSeenSum: number;
  damagePerPlay: number;
  damageShare: number;
  withHandDamageSum?: number;
  withHandSamples?: number;
  withoutHandDamageSum?: number;
  withoutHandSamples?: number;
}

export interface DeckCounts {
  [cardId: string]: number;
}

export interface OptimizeBounds {
  [cardId: string]: { min: number; max: number };
}
