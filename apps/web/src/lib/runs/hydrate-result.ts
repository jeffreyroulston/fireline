import type { OptimizeResult } from "@ga-fire/contracts";
import type { CardStat, LineEvent } from "@/lib/engine";
import { CARDS, type CardId, type DeckCounts, type SimType } from "@/lib/engine";
import type {
  DeckResult,
  RatioResult,
  RatioStrategy,
  SampleHand,
} from "@/features/workbench/types";
import type { ActiveRunRow } from "./types";

interface RunSampleRow {
  id: string;
  card_ids: string[];
  damage: number;
  nodes: string;
  occurrence_count: number;
  events?: LineEvent[];
}

interface RunCardStatRow {
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

interface RunCandidateRow {
  rank: number;
  score: number;
  counts: Record<string, number>;
  candidate?: string | null;
  score_delta?: number | null;
  card_stats?: CardStat[] | null;
}

export interface FetchRunResponse {
  run: ActiveRunRow & {
    sample_damages?: number[] | null;
    p90_damage?: number | null;
    optimize_history?: Array<{ iteration: number; score: number }> | null;
    request_body?: Record<string, unknown>;
  };
  samples: RunSampleRow[];
  cardStats: RunCardStatRow[];
  candidates: RunCandidateRow[];
}

function cardStatFromRow(
  row: RunCardStatRow,
  samples: number,
  totalDamage: number,
) {
  const name = CARDS[row.card_id as CardId]?.name ?? row.card_id;
  const sampleCount = Math.max(samples, 1);
  const inHand = row.opened_copies + row.drawn;
  const openRate = row.opened / sampleCount;
  const seeRate = row.seen / sampleCount;
  const playRate = row.plays / sampleCount;
  const playWhenInHand = inHand > 0 ? row.plays / inHand : 0;
  const damageWhenSeen = row.seen > 0 ? row.damage_when_seen_sum / row.seen : 0;
  const damagePerPlay = row.plays > 0 ? row.damage / row.plays : 0;
  const damageShare = totalDamage > 0 ? row.damage / totalDamage : 0;
  return {
    card: row.card_id,
    name,
    copies: row.copies,
    opened: row.opened,
    openedCopies: row.opened_copies,
    drawn: row.drawn,
    seen: row.seen,
    plays: row.plays,
    attacks: row.attacks,
    damage: row.damage,
    damageWhenSeenSum: row.damage_when_seen_sum,
    openRate,
    seeRate,
    playRate,
    playWhenInHand,
    damageWhenSeen,
    damagePerPlay,
    damageShare,
  };
}

export function hydrateDeckResult(response: FetchRunResponse): DeckResult | null {
  const { run, samples, cardStats } = response;
  if (run.kind !== "evaluate") {
    return null;
  }
  const damages =
    (run.sample_damages as number[] | null | undefined) ??
    samples.flatMap((sample) =>
      Array.from({ length: sample.occurrence_count }, () => sample.damage),
    );
  const hands: SampleHand[] = samples.flatMap((sample) =>
    Array.from({ length: sample.occurrence_count }, () => ({
      hand: sample.card_ids as CardId[],
      damage: sample.damage,
      events: sample.events ?? [],
      nodes: Number(sample.nodes) || 0,
      sampleId: sample.id,
    })),
  );
  const sampleCount = run.samples ?? damages.length;
  const totalDamage = cardStats.reduce((sum, row) => sum + row.damage, 0);
  return {
    simType: (run.sim_type as SimType | null) ?? undefined,
    samples: sampleCount,
    damages,
    hands,
    mean: run.mean_damage ?? 0,
    p50: run.p50_damage ?? 0,
    p90: run.p90_damage ?? 0,
    max: damages.length > 0 ? Math.max(...damages) : 0,
    min: damages.length > 0 ? Math.min(...damages) : 0,
    cardStats: cardStats.map((row) =>
      cardStatFromRow(row, sampleCount, totalDamage),
    ),
  };
}

export function mapOptimizeResultToRatio(result: OptimizeResult): RatioResult {
  const top = result.top.map((row) => ({
    rank: row.rank,
    score: row.score,
    counts: row.counts as DeckCounts,
    scoreDelta: row.scoreDelta ?? null,
    candidate: row.candidate ?? null,
    cardStats: row.cardStats?.length ? row.cardStats : undefined,
  }));
  return {
    bestCounts: result.bestCounts as DeckCounts,
    bestScore: result.bestScore,
    top,
    history: result.history,
    strategy: (result.effective.strategy as RatioStrategy | null) ?? undefined,
  };
}

export function hydrateRatioResult(response: FetchRunResponse): RatioResult | null {
  const { run, candidates } = response;
  if (run.kind !== "optimize") {
    return null;
  }
  const top = candidates.map((row) => ({
    rank: row.rank,
    score: row.score,
    counts: row.counts as DeckCounts,
    scoreDelta: row.score_delta ?? null,
    candidate: row.candidate ?? null,
    cardStats: row.card_stats ?? undefined,
  }));
  const ranked = top.filter((row) => row.rank > 0);
  const best =
    ranked[0] ??
    top.find((row) => row.rank === 0) ??
    top[0];
  return {
    bestCounts: (best?.counts ?? {}) as DeckCounts,
    bestScore: run.best_score ?? best?.score ?? 0,
    top,
    history: run.optimize_history ?? [],
  };
}
