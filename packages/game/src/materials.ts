import type { PlaytestAction } from "@ga-fire/contracts";

import type { MaterialId } from "./types";

/**
 * Engine `State.materials` bit flags. Order matches
 * `crates/engine/src/model.rs` — not the same as `MATERIAL_IDS` table order
 * in stats (zander_2 / soulknife / tristan are shuffled there).
 */
export const MATERIAL_BITS: Readonly<
  Record<Exclude<MaterialId, "spirit_of_fire">, number>
> = {
  impact_hammer: 1 << 0,
  mercenary_blade: 1 << 1,
  poisoned_dagger: 1 << 2,
  zander_1: 1 << 3,
  varuckan_soulknife: 1 << 4,
  tristan_1: 1 << 5,
  zander_2: 1 << 6,
  assassins_ripper: 1 << 7,
  grand_crusaders_ring: 1 << 8,
};

const MATERIAL_BIT_ENTRIES = Object.entries(MATERIAL_BITS) as [
  Exclude<MaterialId, "spirit_of_fire">,
  number,
][];

/** Material cards still in the sideboard for this mask. */
export function materialsFromMask(mask: number): MaterialId[] {
  return MATERIAL_BIT_ENTRIES.filter(([, bit]) => (mask & bit) !== 0).map(
    ([id]) => id,
  );
}

export function materialCountFromMask(mask: number): number {
  let count = 0;
  for (const [, bit] of MATERIAL_BIT_ENTRIES) {
    if ((mask & bit) !== 0) count += 1;
  }
  return count;
}

/** Which material deck card a materialize action spends, if any. */
export function materialIdForAction(action: PlaytestAction): MaterialId | null {
  switch (action.op) {
    case "materializeHammer":
      return "impact_hammer";
    case "materializeDagger":
      return "poisoned_dagger";
    case "materializeSoulknife":
      return "varuckan_soulknife";
    case "materializeRipper":
      return "assassins_ripper";
    case "materializeZanderMemory":
      return "zander_1";
    case "materializeTristanMemory":
      return "tristan_1";
    case "materializeRing":
      return "grand_crusaders_ring";
    default:
      return null;
  }
}
