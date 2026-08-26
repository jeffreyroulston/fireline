/** Core types for the FiZa max-damage engine. */

export type CardId =
  | "brick"
  | "arthur"
  | "kingdom_informant"
  | "clumsy_apprentice"
  | "sable_remnant"
  | "hasty_messenger"
  | "red_hare"
  | "ignited_stab"
  | "rending_flames"
  | "blazing_throw"
  | "racoo"
  | "corhazi_courier"
  | "veteran_blazebearer"
  | "sadi"
  | "captivating_cutthroat"
  | "dazzling_courtesan"
  | "fiery_interference"
  | "heated_vengeance"
  | "intensified_pyre"
  | "march_hare"
  | "mark_the_target"
  | "peppered_chef"
  | "planted_explosive"
  | "rococo"
  | "tweedledum"
  | "vermilion_decree"
  | "xiao_qiao"
  | "hot_cake"
  | "uncanny_realization"
  | "virgil"
  | "vicious_slice";

export type MaterialId =
  | "impact_hammer"
  | "mercenary_blade"
  | "poisoned_dagger"
  | "zander_1"
  | "varuckan_soulknife";

export type Phase =
  | "main"
  | "agility"
  | "end"
  | "enemy_main"
  | "wake"
  | "materialize"
  | "recollect";

export type CardKind = "ally" | "attack" | "action" | "item" | "brick";

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
  unique?: boolean;
  /** Assassin class bonus +power while champion is Assassin. */
  assassinPowerBonus?: number;
  /** Assassin class bonus stealth while champion is Assassin. */
  assassinStealth?: boolean;
  /** Automaton subtype — required for Command Automaton attacks. */
  automaton?: boolean;
  /** Fast activation — playable during materialize before recollect. */
  fast?: boolean;
  floatingMemory?: boolean;
  kindle?: number;
  prepare?: number;
  tags?: string[];
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

export type SimType = "fire_brick" | "monte_carlo" | "two_pass";

/** One reconstructed action on the optimal line (from the WASM solver). */
export interface LineStep {
  turn: number;
  phase: string;
  damage: number;
  allies: number;
  allyNames: string[];
  fireGy: number;
  action: string;
  memory: string;
  hand: string;
  display: string;
}

export interface PassResult {
  maxDamage: number;
  steps: LineStep[];
  nodes: number;
  memoEntries?: number;
}

export interface McRollout {
  damage: number;
  steps: LineStep[];
  nodes: number;
}

export interface DamageDistribution {
  damages: number[];
  mean: number;
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
  steps: LineStep[];
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
}

export interface DeckCounts {
  [cardId: string]: number;
}

export interface OptimizeBounds {
  [cardId: string]: { min: number; max: number };
}
