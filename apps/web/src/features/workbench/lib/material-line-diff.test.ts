import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LineEvent } from "@ga-fire/contracts";
import { describe, expect, it } from "vitest";
import {
  compareMaterialLines,
  isMaterialDecision,
  materialEventKey,
} from "./material-line-diff";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

function loadFixture(name: string): { damage: number; events: LineEvent[] } {
  const text = readFileSync(join(fixtureDir, name), "utf8");
  const jsonLine = text
    .split("\n")
    .find((line) => line.startsWith("{"));
  if (!jsonLine) {
    throw new Error(`No JSON line in fixture ${name}`);
  }
  const parsed = JSON.parse(jsonLine) as {
    damage: number;
    events: LineEvent[];
  };
  return parsed;
}

function baseEvent(overrides: Partial<LineEvent> & Pick<LineEvent, "op" | "kind">): LineEvent {
  return {
    actionIndex: 0,
    turn: 1,
    phase: "main",
    damage: 0,
    fireGy: 0,
    card: null,
    kindle: null,
    drawn: null,
    memoryDraw: null,
    discarded: null,
    prepared: null,
    imbue: null,
    weapon: null,
    commandAlly: null,
    bonuses: null,
    hand: null,
    memory: null,
    allies: null,
    fast: false,
    doubled: false,
    fromMemory: false,
    heated: false,
    human: false,
    gyThreshold: false,
    ...overrides,
  };
}

describe("compareMaterialLines", () => {
  it("treats line-27 play-order variants as equivalent", () => {
    const left = loadFixture("your-line-line-27.txt");
    const right = loadFixture("optimal-3-turns-line-27.txt");
    const result = compareMaterialLines(
      left.events,
      right.events,
      left.damage,
      right.damage,
    );
    expect(result.equivalent).toBe(true);
    expect(result.marks.left.every((mark) => !mark)).toBe(true);
    expect(result.marks.right.every((mark) => !mark)).toBe(true);
  });

  it("treats reordered material decisions within a turn as equivalent", () => {
    const playCorhazi = baseEvent({
      op: "playAlly",
      kind: "play",
      turn: 1,
      card: "corhazi_courier",
    });
    const playMarch = baseEvent({
      op: "playAlly",
      kind: "play",
      turn: 1,
      card: "march_hare",
    });
    const attackCorhazi = baseEvent({
      op: "attackOthers",
      kind: "allyAttack",
      turn: 1,
      card: "corhazi_courier",
      damage: 1,
    });
    const attackMarch = baseEvent({
      op: "attackOthers",
      kind: "allyAttack",
      turn: 1,
      card: "march_hare",
      damage: 2,
    });

    const left = [playCorhazi, playMarch, attackCorhazi, attackMarch];
    const right = [attackCorhazi, playMarch, attackMarch, playCorhazi];

    const result = compareMaterialLines(left, right, 2, 2);
    expect(result.equivalent).toBe(true);
  });

  it("flags an extra attack as a material difference", () => {
    const attack = baseEvent({
      op: "attackOthers",
      kind: "allyAttack",
      turn: 1,
      card: "corhazi_courier",
      damage: 1,
    });
    const left = [attack];
    const right = [attack, attack];

    const result = compareMaterialLines(left, right, 1, 2);
    expect(result.equivalent).toBe(false);
    expect(result.sameDecisions).toBe(false);
    expect(result.marks.right.filter(Boolean)).toHaveLength(1);
  });

  it("flags different kindle amounts as a material difference", () => {
    const playLeft = baseEvent({
      op: "playAlly",
      kind: "play",
      turn: 2,
      card: "dazzling_courtesan",
      kindle: 2,
    });
    const playRight = baseEvent({
      op: "playAlly",
      kind: "play",
      turn: 2,
      card: "dazzling_courtesan",
      kindle: 3,
    });

    const result = compareMaterialLines([playLeft], [playRight], 0, 0);
    expect(result.equivalent).toBe(false);
    expect(result.marks.left[0]).toBe(true);
    expect(result.marks.right[0]).toBe(true);
  });

  it("ignores pipeline events such as corhazi on-hit chains", () => {
    expect(
      isMaterialDecision(
        baseEvent({
          op: "attackOthers",
          kind: "corhaziOnHit",
          turn: 2,
          drawn: "hot_cake",
          discarded: "hot_cake",
        }),
      ),
    ).toBe(false);
  });

  it("uses stable material keys without drawn or discarded fields", () => {
    const withDraw = baseEvent({
      op: "playAlly",
      kind: "play",
      card: "corhazi_courier",
      drawn: "hot_cake",
      discarded: "arthur",
    });
    const withoutDraw = baseEvent({
      op: "playAlly",
      kind: "play",
      card: "corhazi_courier",
    });
    expect(materialEventKey(withDraw)).toBe(materialEventKey(withoutDraw));
  });
});
