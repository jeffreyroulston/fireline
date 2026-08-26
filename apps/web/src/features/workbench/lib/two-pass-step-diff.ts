import type { LineStep } from "@/lib/engine";
import type { StepAlignment, StepDiffInfo } from "../types";

export function twoPassStepDiff(
  brick: LineStep[],
  oracle: LineStep[],
): { brick: StepDiffInfo[]; oracle: StepDiffInfo[] } {
  const brickInfo: StepDiffInfo[] = brick.map(() => ({ mark: "same" }));
  const oracleInfo: StepDiffInfo[] = oracle.map(() => ({ mark: "same" }));
  const m = brick.length;
  const n = oracle.length;

  if (m === 0 && n === 0) {
    return { brick: brickInfo, oracle: oracleInfo };
  }

  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (brick[i - 1].action === oracle[j - 1].action) {
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
    if (
      i > 0 &&
      j > 0 &&
      brick[i - 1].action === oracle[j - 1].action
    ) {
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
          compareAction: brick[paired.brick].action,
        };
        brickInfo[paired.brick] = { mark: "removed" };
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
        compareAction: brick[entry.brick].action,
      };
      brickInfo[entry.brick] = { mark: "removed" };
      index += 1;
    } else {
      brickInfo[entry.brick] = { mark: "removed" };
    }
  }

  return { brick: brickInfo, oracle: oracleInfo };
}
