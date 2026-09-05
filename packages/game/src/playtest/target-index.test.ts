import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type {
  ActionOp,
  PlaytestAction,
  PlaytestActionOption,
} from "@ga-fire/contracts";
import {
  ALLY_ROW_TARGET,
  DAGGER_TARGET_ID,
  MATERIAL_TARGET,
  PHASE_TARGET,
  RING_TARGET,
  actionTargetKey,
  allyTarget,
  buildActionTargetIndex,
  handTarget,
  handTargetForSlot,
  hasVariantChoice,
  isTargetPlayable,
  optionsForHandSlot,
  optionsForTarget,
  targetForAction,
  weaponTarget,
} from "./target-index";

/**
 * Compile-time guard that `ActionOp` minus `start` is exactly the set of ops
 * `PlaytestAction` can carry. Paired with the exhaustive switch in
 * `targetForAction`, a new op cannot reach the UI unrouted.
 */
type OpsMatch<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _opsAgree: OpsMatch<Exclude<ActionOp, "start">, PlaytestAction["op"]> = true;
void _opsAgree;

function option(
  action: PlaytestAction,
  label: string,
  extra: Partial<PlaytestActionOption> = {},
): PlaytestActionOption {
  return {
    action,
    label,
    reserveCount: 0,
    fireOnly: false,
    playedCard: null,
    discardOptional: false,
    discardHand: [],
    drawnDiscardIndex: null,
    discardSteps: [],
    ...extra,
  };
}

function playAlly(card: string, kindle: number): PlaytestAction {
  return {
    op: "playAlly",
    card,
    kindle,
    sacrifice_ally: null,
    hot_cake_sacrifice: false,
    flagrant_level: null,
    flagrant_gy_return: null,
    tristan_agility: false,
    reserved: [],
    reserved_hand_indices: [],
    skip_discard: null,
    discard_hand_index: null,
  };
}

function playAttack(card: string, wield: string | null): PlaytestAction {
  return {
    op: "playAttack",
    card,
    wield,
    prepared: false,
    doubled: false,
    command_ally: null,
    reserved: [],
    reserved_hand_indices: [],
  };
}

function attackArthur(index: number): PlaytestAction {
  return {
    op: "attackArthur",
    index,
    skip_discard: null,
    discard_hand_index: null,
    discard_hand_indices: [],
  };
}

const ATTACK_OTHERS: PlaytestAction = {
  op: "attackOthers",
  skip_discard: null,
  discard_hand_index: null,
  discard_hand_indices: [],
};

/** A plausible mid-turn main phase: two Red Hare in hand, hammer equipped, ring out. */
const FIXTURE: PlaytestActionOption[] = [
  option(playAlly("red_hare", 0), "Play Red Hare"),
  option(playAlly("red_hare", 1), "Play Red Hare · Kindle 1"),
  option(playAttack("rending_flames", "impact_hammer"), "Attack Rending Flames · Wield Impact Hammer"),
  option(attackArthur(0), "Attack with Arthur (ally 0)"),
  option({ op: "activateSadi", index: 2 }, "Activate Sadi (ally 2)"),
  option(ATTACK_OTHERS, "Attack with 2 allies"),
  option({ op: "attackWithWeapon", weapon: "impact_hammer" }, "Attack with Impact Hammer"),
  option(
    { op: "blazingThrow", weapon: "varuckan_soulknife", reserved: [], reserved_hand_indices: [] },
    "Blazing Throw (Varuckan Soulknife)",
  ),
  option({ op: "activateDagger" }, "Activate Poisoned Dagger"),
  option({ op: "materializeZanderMemory", glimpse_layout: 0 }, "Materialize Zander · Red Hare to top"),
  option({ op: "materializeZanderMemory", glimpse_layout: 4 }, "Materialize Zander · Both to bottom"),
  option({ op: "materializeRing" }, "Materialize Grand Crusader's Ring"),
  option({ op: "banishCrusaderRing" }, "Banish Grand Crusader's Ring"),
  option({ op: "pass" }, "Pass"),
];

describe("ActionOp coverage", () => {
  const generated = readFileSync(
    fileURLToPath(new URL("../../../contracts/generated/ActionOp.ts", import.meta.url)),
    "utf8",
  );
  const declaration = generated.slice(generated.indexOf("export type ActionOp"));
  const ops = [...declaration.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);

  test("the generated union parsed", () => {
    expect(ops).toContain("start");
    expect(ops.length).toBeGreaterThanOrEqual(27);
    expect(new Set(ops).size).toBe(ops.length);
  });

  test.each(ops.filter((op) => op !== "start"))("%s maps to a target", (op) => {
    // Only `op`, `card`, `index`, and `weapon` steer the routing, so one
    // over-populated shape stands in for every action variant.
    const action = {
      op,
      card: "red_hare",
      index: 0,
      weapon: "impact_hammer",
    } as unknown as PlaytestAction;
    expect(targetForAction(action)).not.toBeNull();
  });

  test("start is an event op and has no board target", () => {
    expect(targetForAction({ op: "start" } as unknown as PlaytestAction)).toBeNull();
  });
});

describe("buildActionTargetIndex", () => {
  const index = buildActionTargetIndex(FIXTURE);

  test("groups the fixture by board target", () => {
    expect(index.targets.map((entry) => entry.key)).toEqual([
      "hand:red_hare",
      "hand:rending_flames",
      "ally:0",
      "ally:2",
      "allyRow",
      "weapon:impact_hammer",
      "weapon:varuckan_soulknife",
      `weapon:${DAGGER_TARGET_ID}`,
      "material",
      "ring",
      "phase",
    ]);
  });

  test("indexes every option exactly once and invents none", () => {
    const indexed = index.targets.flatMap((entry) => entry.options);
    expect(indexed).toHaveLength(FIXTURE.length);
    expect(index.unrouted).toEqual([]);
    expect(indexed.map((entry) => entry.optionIndex).sort((a, b) => a - b)).toEqual(
      FIXTURE.map((_, position) => position),
    );
    for (const entry of indexed) {
      expect(entry.option).toBe(FIXTURE[entry.optionIndex]);
    }
  });

  test("groups kindle variants under one hand target with engine labels verbatim", () => {
    const options = optionsForTarget(index, handTarget("red_hare"));
    expect(options.map((entry) => entry.label)).toEqual([
      "Play Red Hare",
      "Play Red Hare · Kindle 1",
    ]);
    expect(hasVariantChoice(index, handTarget("red_hare"))).toBe(true);
    expect(hasVariantChoice(index, handTarget("rending_flames"))).toBe(false);
  });

  test("groups Glimpse layouts under the material zone", () => {
    expect(optionsForTarget(index, MATERIAL_TARGET).map((entry) => entry.label)).toEqual([
      "Materialize Zander · Red Hare to top",
      "Materialize Zander · Both to bottom",
    ]);
  });

  test("keeps ally tiles, the ally row, and the phase bar apart", () => {
    expect(optionsForTarget(index, allyTarget(0))).toHaveLength(1);
    expect(optionsForTarget(index, allyTarget(2))).toHaveLength(1);
    expect(optionsForTarget(index, ALLY_ROW_TARGET).map((entry) => entry.label)).toEqual([
      "Attack with 2 allies",
    ]);
    expect(optionsForTarget(index, PHASE_TARGET).map((entry) => entry.label)).toEqual(["Pass"]);
  });

  test("routes weapon ops to their own tiles", () => {
    expect(optionsForTarget(index, weaponTarget("impact_hammer")).map((e) => e.label)).toEqual([
      "Attack with Impact Hammer",
    ]);
    expect(optionsForTarget(index, weaponTarget("varuckan_soulknife")).map((e) => e.label)).toEqual([
      "Blazing Throw (Varuckan Soulknife)",
    ]);
    expect(optionsForTarget(index, weaponTarget(DAGGER_TARGET_ID)).map((e) => e.label)).toEqual([
      "Activate Poisoned Dagger",
    ]);
  });

  test("collects both ring ops on the ring tile", () => {
    expect(optionsForTarget(index, RING_TARGET).map((entry) => entry.label)).toEqual([
      "Materialize Grand Crusader's Ring",
      "Banish Grand Crusader's Ring",
    ]);
  });

  test("a target the engine did not offer is empty and unplayable", () => {
    expect(optionsForTarget(index, allyTarget(5))).toEqual([]);
    expect(isTargetPlayable(index, allyTarget(5))).toBe(false);
    expect(isTargetPlayable(index, handTarget("hot_cake"))).toBe(false);
    expect(isTargetPlayable(index, allyTarget(0))).toBe(true);
  });

  test("an unroutable op is surfaced, not silently dropped", () => {
    const junk = option({ op: "someFutureOp" } as unknown as PlaytestAction, "Future");
    const withJunk = buildActionTargetIndex([...FIXTURE, junk]);
    expect(withJunk.unrouted.map((entry) => entry.label)).toEqual(["Future"]);
    expect(withJunk.targets.map((entry) => entry.key)).toEqual(
      index.targets.map((entry) => entry.key),
    );
  });
});

describe("hand duplicates", () => {
  const index = buildActionTargetIndex(FIXTURE);
  const hand = ["red_hare", "rending_flames", "red_hare"];

  test("both copies of a duplicated card offer the same options", () => {
    const first = optionsForHandSlot(index, hand, 0);
    const second = optionsForHandSlot(index, hand, 2);
    expect(second).toBe(first);
    expect(second.map((entry) => entry.label)).toEqual([
      "Play Red Hare",
      "Play Red Hare · Kindle 1",
    ]);
  });

  test("slots key through to the card id target", () => {
    expect(handTargetForSlot(hand, 1)).toEqual(handTarget("rending_flames"));
    expect(actionTargetKey(handTargetForSlot(hand, 2)!)).toBe("hand:red_hare");
  });

  test("a slot outside the hand has no target and no options", () => {
    expect(handTargetForSlot(hand, 7)).toBeNull();
    expect(optionsForHandSlot(index, hand, 7)).toEqual([]);
  });
});
