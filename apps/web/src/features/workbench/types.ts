import type { SparseLineStats, TapePhase } from "@ga-fire/contracts";
import type {
  CardId,
  CardStat,
  DamageDistribution,
  DeckCounts,
  LineEvent,
  SimType,
  SolveResult,
  TwoPassResult,
} from "@/lib/engine";

export type Tab =
  | "line"
  | "manage"
  | "deck"
  | "ratios"
  | "cards"
  | "history"
  | "info";
export type JobType = "solve" | "evaluate" | "optimize";
export type SolverMode = "hand" | "deck" | "playtest";

export const DEFAULT_TURN2_KILL_THRESHOLD = 19;

export type LineHorizon = 2 | 3;

export type Turn2KillResults = Readonly<{
  turn2: SolveResult;
  turn3: SolveResult;
  threshold: number;
}>;

export interface SampleHand {
  hand: CardId[];
  damage: number;
  endInfluence?: number;
  events: LineEvent[];
  nodes: number;
  /** `run_samples.id` when loaded from the database. */
  sampleId?: string | null;
  distribution?: DamageDistribution;
  twoPass?: TwoPassResult;
  lineCardStats?: SparseLineStats | null;
}

export interface DeckResult {
  simType?: SimType;
  samples: number;
  timedOutSamples?: number;
  damages: number[];
  hands: SampleHand[];
  mean: number;
  p10?: number;
  p50: number;
  p90: number;
  max: number;
  min: number;
  meanEndInfluence?: number;
  cardStats?: CardStat[];
  brickCardStats?: CardStat[];
  oracleCardStats?: CardStat[];
}

export const SIM_TYPE_LABELS: Record<SimType, string> = {
  fire_brick: "Fire brick",
  monte_carlo: "Monte Carlo — Sample",
  two_pass: "Two-pass",
  oracle_only: "Oracle only",
};

export type RatioStrategy =
  | "randomSample"
  | "hillClimb"
  | "genetic"
  | "swapSweep"
  | "multiDeck";

export type RatioEvalMode = "full" | "sprt";

export interface RatioResult {
  bestCounts: DeckCounts;
  bestScore: number;
  strategy?: RatioStrategy;
  top?: {
    rank: number;
    score: number;
    counts: DeckCounts;
    scoreDelta?: number | null;
    candidate?: string | null;
    cardStats?: CardStat[];
    damages?: number[];
  }[];
  history: { iteration: number; score: number }[];
}

export interface RatioRefineCriteria {
  baseDeckName: string;
  baseCounts: DeckCounts;
  cutBudgets: Partial<Record<CardId, number>>;
  replacements: Partial<Record<CardId, number>>;
}

export type StepDiffMark = "same" | "added" | "removed";

export interface StepDiffInfo {
  mark: StepDiffMark;
  compareEvent?: LineEvent;
}

export type StepAlignment =
  | { kind: "match"; brick: number; oracle: number }
  | { kind: "oracle-only"; oracle: number }
  | { kind: "brick-only"; brick: number };

export type MaterialLineMarks = Readonly<{
  left: boolean[];
  right: boolean[];
}>;

export type MaterialLineDiff = Readonly<{
  equivalent: boolean;
  sameDamage: boolean;
  sameTurns: boolean;
  sameDecisions: boolean;
  leftDamage: number;
  rightDamage: number;
  divergentTurn: number | null;
  marks: MaterialLineMarks;
}>;

export const PHASE_LABELS: Record<TapePhase, string> = {
  main: "Main",
  materialize: "Materialize",
  recollect: "Recollect",
  agility: "Agility",
  end: "End",
  enemyMain: "Enemy Main",
  enemyEnd: "Enemy End",
  wake: "Wake",
};
