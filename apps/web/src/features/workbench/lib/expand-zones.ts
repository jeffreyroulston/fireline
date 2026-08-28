import type { LineEvent } from "@ga-fire/contracts";

/** Carry last non-null hand/memory/allies forward so every event has zone arrays. */
export function expandEventZones(events: LineEvent[]): LineEvent[] {
  let hand: string[] = [];
  let memory: string[] = [];
  let allies: string[] = [];

  return events.map((event) => {
    if (event.hand != null) hand = event.hand;
    if (event.memory != null) memory = event.memory;
    if (event.allies != null) allies = event.allies;
    return { ...event, hand: [...hand], memory: [...memory], allies: [...allies] };
  });
}
