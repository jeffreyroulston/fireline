import { describe, expect, test } from "vitest";

import {
  MATERIAL_BITS,
  materialCountFromMask,
  materialsFromMask,
} from "./materials";

describe("materialsFromMask", () => {
  test("returns nothing for an empty mask", () => {
    expect(materialsFromMask(0)).toEqual([]);
    expect(materialCountFromMask(0)).toBe(0);
  });

  test("decodes default ALL_MATERIALS-style bits", () => {
    const mask =
      MATERIAL_BITS.impact_hammer |
      MATERIAL_BITS.mercenary_blade |
      MATERIAL_BITS.poisoned_dagger |
      MATERIAL_BITS.zander_1 |
      MATERIAL_BITS.varuckan_soulknife;
    expect(materialsFromMask(mask)).toEqual([
      "impact_hammer",
      "mercenary_blade",
      "poisoned_dagger",
      "zander_1",
      "varuckan_soulknife",
    ]);
    expect(materialCountFromMask(mask)).toBe(5);
  });

  test("keeps zander_2 / tristan / ring on their engine bits", () => {
    const mask =
      MATERIAL_BITS.zander_2 | MATERIAL_BITS.tristan_1 | MATERIAL_BITS.grand_crusaders_ring;
    expect(materialsFromMask(mask)).toEqual([
      "tristan_1",
      "zander_2",
      "grand_crusaders_ring",
    ]);
  });
});

describe("materialIdForAction", () => {
  test("maps materialize ops to deck cards", async () => {
    const { materialIdForAction } = await import("./materials");
    expect(materialIdForAction({ op: "materializeHammer" })).toBe("impact_hammer");
    expect(materialIdForAction({ op: "materializeZanderMemory", glimpse_layout: 0 })).toBe(
      "zander_1",
    );
    expect(materialIdForAction({ op: "pass" })).toBeNull();
  });
});
