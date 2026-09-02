import type { EventKind, LineEvent } from "@ga-fire/contracts";
import type { MaterialLineDiff, MaterialLineMarks } from "../types";

const NON_MATERIAL_KINDS = new Set<EventKind>([
  "start",
  "passOpportunity",
  "endAgility",
  "endMain",
  "enemyMain",
  "wake",
  "materializeResolves",
  "recollect",
  "corhaziOnHit",
  "onEnterDamage",
  "onEnterDraw",
  "onEnterLevel",
  "onDeath",
  "uniqueDies",
  "floatForZander",
  "floatForZander2",
  "floatForTristan",
  "floatForRipper",
  "levelZander",
  "levelZander2",
  "levelTristan",
  "zanderGyReturn",
  "glimpse",
  "tristanRecollect",
  "sadiBounce",
  "arsonistStealth",
  "sacrifice",
  "immortalize",
  "hotCakeSacrifice",
  "chefBuff",
  "cutthroatSelf",
  "onAttackDraw",
  "hammerSelf",
  "banishCrusaderRing",
]);

const MATERIALIZE_SUBSTEP_KINDS = new Set<EventKind>([
  "floatForZander",
  "floatForZander2",
  "floatForTristan",
  "floatForRipper",
  "levelZander",
  "levelZander2",
  "levelTristan",
  "zanderGyReturn",
  "glimpse",
  "materializeResolves",
]);

export function isMaterialDecision(event: LineEvent): boolean {
  if (event.op === "pass" || event.op === "start") {
    return false;
  }
  if (NON_MATERIAL_KINDS.has(event.kind)) {
    return false;
  }
  if (
    event.op.startsWith("materialize") &&
    MATERIALIZE_SUBSTEP_KINDS.has(event.kind)
  ) {
    return false;
  }
  return true;
}

export function materialEventKey(event: LineEvent): string {
  const modifiers = JSON.stringify({
    kindle: event.kindle ?? null,
    prepared: event.prepared ?? null,
    imbue: event.imbue ?? null,
    weapon: event.weapon ?? null,
    commandAlly: event.commandAlly ?? null,
    bonuses: event.bonuses ?? null,
    fast: event.fast ?? false,
    doubled: event.doubled ?? false,
    heated: event.heated ?? false,
    human: event.human ?? false,
    gyThreshold: event.gyThreshold ?? false,
    fromMemory: event.fromMemory ?? false,
  });
  return `${event.op}\0${event.kind}\0${event.card ?? ""}\0${modifiers}`;
}

function maxTurn(events: LineEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.turn), 0);
}

function finalDamage(events: LineEvent[]): number {
  return events.at(-1)?.damage ?? 0;
}

function materialDecisionsByTurn(
  events: LineEvent[],
): Map<number, string[]> {
  const byTurn = new Map<number, string[]>();
  for (const event of events) {
    if (!isMaterialDecision(event)) {
      continue;
    }
    const turn = event.turn;
    const bucket = byTurn.get(turn) ?? [];
    bucket.push(materialEventKey(event));
    byTurn.set(turn, bucket);
  }
  return byTurn;
}

function sortedMultiset(values: string[]): string[] {
  return [...values].sort();
}

function multisetsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = sortedMultiset(left);
  const sortedRight = sortedMultiset(right);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function multisetCounts(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function decrementMultiset(
  counts: Map<string, number>,
  key: string,
): boolean {
  const remaining = counts.get(key) ?? 0;
  if (remaining <= 0) {
    return false;
  }
  if (remaining === 1) {
    counts.delete(key);
  } else {
    counts.set(key, remaining - 1);
  }
  return true;
}

function turnBucketsMatch(
  left: Map<number, string[]>,
  right: Map<number, string[]>,
): boolean {
  const turns = new Set([...left.keys(), ...right.keys()]);
  for (const turn of turns) {
    const leftBucket = left.get(turn) ?? [];
    const rightBucket = right.get(turn) ?? [];
    if (!multisetsEqual(leftBucket, rightBucket)) {
      return false;
    }
  }
  return true;
}

function firstTurnWithMaterialDiff(
  left: Map<number, string[]>,
  right: Map<number, string[]>,
): number | null {
  const turns = [...new Set([...left.keys(), ...right.keys()])].sort(
    (a, b) => a - b,
  );
  for (const turn of turns) {
    const leftBucket = left.get(turn) ?? [];
    const rightBucket = right.get(turn) ?? [];
    if (!multisetsEqual(leftBucket, rightBucket)) {
      return turn;
    }
  }
  return null;
}

function materialEventMarks(
  events: LineEvent[],
  otherByTurn: Map<number, string[]>,
): boolean[] {
  const otherCountsByTurn = new Map<number, Map<string, number>>();
  for (const [turn, keys] of otherByTurn) {
    otherCountsByTurn.set(turn, multisetCounts(keys));
  }

  return events.map((event) => {
    if (!isMaterialDecision(event)) {
      return false;
    }
    const key = materialEventKey(event);
    const counts = otherCountsByTurn.get(event.turn);
    if (!counts) {
      return true;
    }
    if (decrementMultiset(counts, key)) {
      return false;
    }
    return true;
  });
}

export function compareMaterialLines(
  leftEvents: LineEvent[],
  rightEvents: LineEvent[],
  leftDamage?: number,
  rightDamage?: number,
): MaterialLineDiff {
  const leftByTurn = materialDecisionsByTurn(leftEvents);
  const rightByTurn = materialDecisionsByTurn(rightEvents);
  const resolvedLeftDamage = leftDamage ?? finalDamage(leftEvents);
  const resolvedRightDamage = rightDamage ?? finalDamage(rightEvents);
  const leftTurns = maxTurn(leftEvents);
  const rightTurns = maxTurn(rightEvents);

  const sameDamage = resolvedLeftDamage === resolvedRightDamage;
  const sameTurns = leftTurns === rightTurns;
  const sameDecisions = turnBucketsMatch(leftByTurn, rightByTurn);
  const equivalent = sameDamage && sameTurns && sameDecisions;

  const marks: MaterialLineMarks = {
    left: equivalent
      ? leftEvents.map(() => false)
      : materialEventMarks(leftEvents, rightByTurn),
    right: equivalent
      ? rightEvents.map(() => false)
      : materialEventMarks(rightEvents, leftByTurn),
  };

  const divergentTurn = equivalent
    ? null
    : firstTurnWithMaterialDiff(leftByTurn, rightByTurn);

  return {
    equivalent,
    sameDamage,
    sameTurns,
    sameDecisions,
    leftDamage: resolvedLeftDamage,
    rightDamage: resolvedRightDamage,
    divergentTurn,
    marks,
  };
}
