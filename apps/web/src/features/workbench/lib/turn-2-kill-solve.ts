import type { SolveRequest } from "@ga-fire/contracts";
import type { CardId, DeckCounts, SolveResult } from "@/lib/engine";
import { solve as apiSolve } from "@/lib/api/client";
import { DEFAULT_BUDGET } from "@/lib/budget";
import { subtractCards } from "../utils";

export function buildSolveQueue(
  hand: CardId[],
  drawn: CardId[],
  orderedDeck: CardId[],
): CardId[] {
  if (orderedDeck.length === 0) {
    return drawn;
  }
  return [...drawn, ...subtractCards(orderedDeck, [...hand, ...drawn])];
}

/** Oracle line-solve params shared by playtest compare and 2TK detection. */
export function oracleSolveRequest(options: {
  hand: CardId[];
  goFirst: boolean;
  materials: DeckCounts;
  deck: DeckCounts | undefined;
  queue: CardId[];
  seed?: number;
  maxThreads?: number | null;
  glimpseEnabled?: boolean;
  maxHandDurationSecs?: number | null;
  maxCardDraw?: number | null;
}): Omit<SolveRequest, "maxTurns"> {
  return {
    hand: [...options.hand],
    goFirst: options.goFirst,
    simType: "oracle_only",
    rollouts: 1,
    seed: (options.seed ?? 42) as unknown as bigint,
    materials: options.materials,
    deck: options.deck ?? {},
    queue: options.queue,
    budget: DEFAULT_BUDGET,
    maxThreads: options.maxThreads ?? null,
    glimpseEnabled: options.glimpseEnabled ?? true,
    maxHandDurationSecs: options.maxHandDurationSecs ?? null,
    maxCardDraw: options.maxCardDraw ?? null,
  };
}

/** Run 2- and 3-turn solves sequentially (worker allows one solve permit at a time). */
export async function solveTurn2KillPair(
  requestBase: Omit<SolveRequest, "maxTurns">,
  options?: { signal?: AbortSignal },
): Promise<{ turn2: SolveResult; turn3: SolveResult }> {
  const result2 = await apiSolve(
    { ...requestBase, maxTurns: 2 },
    options,
  );
  const result3 = await apiSolve(
    { ...requestBase, maxTurns: 3 },
    options,
  );
  return {
    turn2: result2 as unknown as SolveResult,
    turn3: result3 as unknown as SolveResult,
  };
}
