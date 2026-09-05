import type { Context } from "hono";
import { fetchWorkerJson, WorkerError } from "../services/worker.js";

/** Thin JSON proxy to the worker playtest / game step handlers. */
export async function proxyPlaytestJson<TReq, TRes>(
  c: Context,
  workerBase: string,
  path: string,
): Promise<Response> {
  const body = await c.req.json<TReq>();
  try {
    const result = await fetchWorkerJson<TRes>(workerBase, path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(result);
  } catch (error) {
    if (error instanceof WorkerError) {
      return c.json(
        { error: error.message },
        (error.status === 503 ? 503 : 400) as 400 | 503,
      );
    }
    throw error;
  }
}
