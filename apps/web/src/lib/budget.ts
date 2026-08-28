import type { Budget } from "@ga-fire/contracts";

/** Matches `Budget::default()` in the Rust engine; worker config overrides when unchanged. */
export const DEFAULT_BUDGET: Budget = {
  maxTurnsMin: 2,
  maxTurnsMax: 5,
  maxSolveRollouts: 48,
  maxEvalRollouts: 24,
  maxOptimizeDecks: 5000,
};
