import initWasm, {
  evaluateJson,
  optimizeJson,
  solveJson,
} from "./wasm/ga_fire_engine.js";

let initialized;

function ensureWasm() {
  initialized ??= initWasm();
  return initialized;
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    await ensureWasm();

    if (type === "solve") {
      const result = JSON.parse(solveJson(JSON.stringify(payload)));
      self.postMessage({ id, type: "result", result });
      return;
    }

    if (type === "evaluate") {
      const result = JSON.parse(
        evaluateJson(
          JSON.stringify({
            deck: payload.counts,
            samples: payload.samples,
            goFirst: payload.goFirst,
            maxTurns: payload.maxTurns,
            seed: payload.seed ?? (Math.floor(Math.random() * 0xffffffff) >>> 0),
            simType: payload.simType ?? "fire_brick",
            rollouts: payload.rollouts ?? 8,
          }),
        ),
      );
      self.postMessage({ id, type: "result", result });
      return;
    }

    const result = JSON.parse(
      optimizeJson(
        JSON.stringify({
          bounds: payload.bounds,
          deckSize: payload.deckSize,
          samples: payload.samples,
          decks: payload.decks ?? payload.iterations ?? 32,
          metric: payload.metric,
          seed: 7,
        }),
        (progressJson) => {
          self.postMessage({
            id,
            type: "progress",
            progress: JSON.parse(progressJson),
          });
        },
      ),
    );
    self.postMessage({ id, type: "result", result });
  } catch (error) {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String(error.message)
            : "The calculation failed.";
    self.postMessage({
      id,
      type: "error",
      error: message,
    });
  }
};
