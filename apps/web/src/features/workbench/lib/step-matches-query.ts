import type { LineStep } from "@/lib/engine";

/** Match the step’s action only (not hand, memory, allies, or other display fields). */
export function stepMatchesQuery(step: LineStep, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return step.action.toLowerCase().includes(needle);
}
