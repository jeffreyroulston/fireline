import type {
  CardId,
  CardStat,
  DamageDistribution,
  DeckCounts,
  LineStep,
  SimType,
  TwoPassResult,
} from "@/lib/engine";

export type Tab = "line" | "deck" | "ratios" | "history";
export type JobType = "solve" | "evaluate" | "optimize";

export interface SampleHand {
  hand: CardId[];
  damage: number;
  steps: LineStep[];
  nodes: number;
  distribution?: DamageDistribution;
  twoPass?: TwoPassResult;
}

export interface DeckResult {
  simType?: SimType;
  samples: number;
  damages: number[];
  hands: SampleHand[];
  mean: number;
  p50: number;
  p90: number;
  max: number;
  min: number;
  cardStats?: CardStat[];
}

export const SIM_TYPE_LABELS: Record<SimType, string> = {
  fire_brick: "Fire brick",
  monte_carlo: "Monte Carlo — Sample",
  two_pass: "Two-pass",
};

export interface RatioResult {
  bestCounts: DeckCounts;
  bestScore: number;
  top?: {
    rank: number;
    score: number;
    counts: DeckCounts;
  }[];
  history: { iteration: number; score: number }[];
}

export type StepDiffMark = "same" | "added" | "removed";

export interface StepDiffInfo {
  mark: StepDiffMark;
  compareAction?: string;
}

export type StepAlignment =
  | { kind: "match"; brick: number; oracle: number }
  | { kind: "oracle-only"; oracle: number }
  | { kind: "brick-only"; brick: number };

export const PHASE_LABELS: Record<string, string> = {
  Main: "Main",
  Mate: "Materialize",
  Reco: "Recollect",
  Agil: "Agility",
  End: "End",
  EMai: "Enemy Main",
  EEnd: "Enemy End",
  Wake: "Wake",
};
