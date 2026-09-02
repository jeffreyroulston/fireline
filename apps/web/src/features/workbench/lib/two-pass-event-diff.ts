import type { LineEvent } from "@ga-fire/contracts";
import type { StepAlignment, StepDiffInfo } from "../types";

function eventKey(event: LineEvent): string {
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
    drawn: event.drawn ?? null,
    discarded: event.discarded ?? null,
  });
  return `${event.op}\0${event.kind}\0${event.card ?? ""}\0${modifiers}`;
}

function eventsEqual(a: LineEvent, b: LineEvent): boolean {
  return eventKey(a) === eventKey(b);
}

export function alignLineEvents(
  brick: LineEvent[],
  oracle: LineEvent[],
): StepAlignment[] {
  const m = brick.length;
  const n = oracle.length;

  if (m === 0 && n === 0) {
    return [];
  }

  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (eventsEqual(brick[i - 1], oracle[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const alignment: StepAlignment[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && eventsEqual(brick[i - 1], oracle[j - 1])) {
      alignment.push({ kind: "match", brick: i - 1, oracle: j - 1 });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      alignment.push({ kind: "oracle-only", oracle: j - 1 });
      j -= 1;
    } else {
      alignment.push({ kind: "brick-only", brick: i - 1 });
      i -= 1;
    }
  }

  alignment.reverse();
  return alignment;
}

export function twoPassEventDiff(
  brick: LineEvent[],
  oracle: LineEvent[],
): { brick: StepDiffInfo[]; oracle: StepDiffInfo[] } {
  const brickInfo: StepDiffInfo[] = brick.map(() => ({ mark: "same" }));
  const oracleInfo: StepDiffInfo[] = oracle.map(() => ({ mark: "same" }));
  const alignment = alignLineEvents(brick, oracle);

  if (alignment.length === 0) {
    return { brick: brickInfo, oracle: oracleInfo };
  }

  for (let index = 0; index < alignment.length; index += 1) {
    const entry = alignment[index];

    if (entry.kind === "match") {
      continue;
    }

    if (entry.kind === "oracle-only") {
      const paired = alignment[index + 1];
      if (paired?.kind === "brick-only") {
        oracleInfo[entry.oracle] = {
          mark: "added",
          compareEvent: brick[paired.brick],
        };
        brickInfo[paired.brick] = {
          mark: "removed",
          compareEvent: oracle[entry.oracle],
        };
        index += 1;
      } else {
        oracleInfo[entry.oracle] = { mark: "added" };
      }
      continue;
    }

    const paired = alignment[index + 1];
    if (paired?.kind === "oracle-only") {
      oracleInfo[paired.oracle] = {
        mark: "added",
        compareEvent: brick[entry.brick],
      };
      brickInfo[entry.brick] = {
        mark: "removed",
        compareEvent: oracle[paired.oracle],
      };
      index += 1;
    } else {
      brickInfo[entry.brick] = { mark: "removed" };
    }
  }

  return { brick: brickInfo, oracle: oracleInfo };
}
