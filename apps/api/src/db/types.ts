export interface DecksTable {
  id: string;
  name: string;
  text: string;
  counts: Record<string, number>;
  deck_hash: string;
  created_at: Date;
  updated_at: Date;
}

export type RunKind = "solve" | "evaluate" | "optimize";
export type RunStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface RunsTable {
  id: string;
  kind: RunKind;
  status: RunStatus;
  sim_type: string | null;
  root_seed: string | null;
  deck_hash: string | null;
  deck_id: string | null;
  deck_counts: Record<string, number>;
  go_first: boolean | null;
  max_turns: number | null;
  rollouts: number | null;
  samples: number | null;
  budget: Record<string, unknown> | null;
  metric: string | null;
  bounds: Record<string, { min: number; max: number }> | null;
  deck_size: number | null;
  decks_requested: number | null;
  rules_version: number | null;
  sampler_version: number | null;
  attribution_version: number | null;
  card_digest: string | null;
  build: string | null;
  started_at: Date;
  completed_at: Date | null;
  elapsed_ms: number | null;
  error_message: string | null;
  mean_damage: number | null;
  p50_damage: number | null;
  p90_damage: number | null;
  max_damage: number | null;
  min_damage: number | null;
  best_score: number | null;
  damage_histogram: number[] | null;
  sample_damages: number[] | null;
  optimize_history: Array<{ iteration: number; score: number }> | null;
  request_body: Record<string, unknown>;
}

export interface RunSamplesTable {
  id: string;
  run_id: string;
  hand_hash: string;
  card_ids: string[];
  occurrence_count: number;
  damage: number;
  nodes: string;
  steps: unknown[] | null;
}

export interface RunCardStatsTable {
  run_id: string;
  card_id: string;
  copies: number;
  opened: number;
  opened_copies: number;
  drawn: number;
  seen: number;
  plays: number;
  attacks: number;
  damage: number;
  damage_when_seen_sum: number;
}

export interface RunCandidatesTable {
  run_id: string;
  rank: number;
  score: number;
  counts: Record<string, number>;
  deck_hash: string;
}

export interface Database {
  decks: DecksTable;
  runs: RunsTable;
  run_samples: RunSamplesTable;
  run_card_stats: RunCardStatsTable;
  run_candidates: RunCandidatesTable;
}
