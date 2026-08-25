import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generatedDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/contracts/generated",
);

const files = (await readdir(generatedDir)).filter((file) => file.endsWith(".ts") && file !== "index.ts");
for (const file of files) {
  const fullPath = path.join(generatedDir, file);
  const source = await readFile(fullPath, "utf8");
  const fixed = source.replace(/from "\.\/([^"]+)";/g, (match, name) =>
    name.endsWith(".js") ? match : `from "./${name}.js";`,
  );
  if (fixed !== source) {
    await writeFile(fullPath, fixed);
  }
}

const index = `export type { Budget } from "./Budget.js";
export type { Bounds } from "./Bounds.js";
export type { CardDef } from "./CardDef.js";
export type { CardStat } from "./CardStat.js";
export type { DamageDistribution } from "./DamageDistribution.js";
export type { DeckEvalRequest } from "./DeckEvalRequest.js";
export type { DeckEvalResult } from "./DeckEvalResult.js";
export type { EffectiveRequest } from "./EffectiveRequest.js";
export type { EngineVersion } from "./EngineVersion.js";
export type { HistoryPoint } from "./HistoryPoint.js";
export type { McRollout } from "./McRollout.js";
export type { Metric } from "./Metric.js";
export type { OptimizeProgress } from "./OptimizeProgress.js";
export type { OptimizeRequest } from "./OptimizeRequest.js";
export type { OptimizeResult } from "./OptimizeResult.js";
export type { PassResult } from "./PassResult.js";
export type { RankedDeck } from "./RankedDeck.js";
export type { SampleHand } from "./SampleHand.js";
export type { SimType } from "./SimType.js";
export type { SolveRequest } from "./SolveRequest.js";
export type { SolveResult } from "./SolveResult.js";
export type { Step } from "./Step.js";
export type { TwoPassResult } from "./TwoPassResult.js";
`;

await writeFile(path.join(generatedDir, "index.ts"), index);
