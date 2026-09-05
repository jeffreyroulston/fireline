import type { PlaytestStateView } from "@ga-fire/contracts";

import type { MaterialId } from "../types";

/** Placeholder opponent champion until real opponent modeling exists. */
export const ENEMY_CHAMPION_ID = "spirit_of_fire" as const satisfies MaterialId;

/** Printed life on Spirit of Fire (Aithne). */
export const ENEMY_CHAMPION_LIFE = 15;

export function enemyChampionDefeated(damage: number): boolean {
  return damage >= ENEMY_CHAMPION_LIFE;
}

/** Play session ends only when the enemy champion is defeated. */
export function isPlaySessionDone(board: PlaytestStateView): boolean {
  return enemyChampionDefeated(board.damage);
}

/**
 * Engine `max_turns` is still required (u8). Play mode uses the ceiling so the
 * line is not cut short before a kill.
 */
export const PLAY_MAX_TURNS = 255;

export function enemyLifeRemaining(damage: number): number {
  return Math.max(0, ENEMY_CHAMPION_LIFE - damage);
}
