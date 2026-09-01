import type { SolverMode } from "../../types";

export const SOLVER_MODES: { id: SolverMode; label: string }[] = [
  { id: "hand", label: "Hand" },
  { id: "deck", label: "Deck" },
  { id: "playtest", label: "Playtest" },
];
