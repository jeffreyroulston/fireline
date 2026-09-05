import { CARDS, type CardId, type MaterialId } from "@ga-fire/game";
import type { PlaytestStateView } from "@ga-fire/contracts";

export const PHASE_LABEL: Record<string, string> = {
  main: "Main",
  materialize: "Materialize",
  preRecollect: "Pre-Recollect",
  recollect: "Recollect",
  agility: "Agility",
  end: "End",
  enemyMain: "Enemy Main",
  enemyEnd: "Enemy End",
  wake: "Wake",
};

/** HUD / button wording for phase-bar actions (Pass, skips, etc.). */
export function phaseActionLabel(
  op: string,
  phase: string,
  fallback: string,
): string {
  const name = PHASE_LABEL[phase] ?? phase;
  switch (op) {
    case "pass":
      return `End ${name} phase`;
    case "skipMaterialize":
      return "End Materialize phase";
    case "skipPreRecollect":
      return "End Pre-Recollect phase";
    case "skipAgility":
      return "End Agility phase";
    default:
      return fallback;
  }
}

export function championBoardCard(
  board: PlaytestStateView,
): MaterialId | null {
  if (board.tristanLeveled) {
    return "tristan_1";
  }
  if (board.championLevel === 0) {
    return "spirit_of_fire";
  }
  return board.championLevel >= 2 ? "zander_2" : "zander_1";
}

export function zoneCount(map: Record<string, number | undefined>): number {
  return Object.values(map).reduce<number>(
    (sum, count) => sum + (count ?? 0),
    0,
  );
}

export function expandZoneMap(
  map: Record<string, number | undefined>,
): (CardId | MaterialId | string)[] {
  const out: (CardId | MaterialId | string)[] = [];
  const entries = Object.entries(map).sort(([leftId], [rightId]) => {
    const left = CARDS[leftId]?.name ?? leftId;
    const right = CARDS[rightId]?.name ?? rightId;
    return left.localeCompare(right);
  });
  for (const [id, count] of entries) {
    for (let index = 0; index < (count ?? 0); index += 1) {
      out.push(id);
    }
  }
  return out;
}

/** Total banish pile count including ring when banished separately. */
export function banishCount(board: PlaytestStateView): number {
  return zoneCount(board.banished ?? {}) + (board.ringBanished ? 1 : 0);
}

export function banishCards(
  board: PlaytestStateView,
): (CardId | MaterialId | string)[] {
  const cards = expandZoneMap(board.banished ?? {});
  if (board.ringBanished) {
    cards.push("grand_crusaders_ring");
  }
  return cards;
}
