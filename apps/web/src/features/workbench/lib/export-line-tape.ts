import type { LineEvent } from "@/lib/engine";
import { expandEventZones } from "./expand-zones";
import {
  formatLineEventRow,
  type CatalogEntry,
} from "./format-line-event";

export const LINE_TAPE_PAYLOAD_MARKER = "--- fireline-line-v1 ---";

export type LineTapePayload = {
  version: 1;
  label?: string;
  damage?: number;
  hand: string[];
  goFirst: boolean;
  turns: number;
  events: LineEvent[];
};

export function openingHandFromEvents(events: LineEvent[]): string[] {
  const tape = expandEventZones(events);
  const start = events.find((event) => event.kind === "start");
  const firstHand = tape[0]?.hand ?? [];
  if (start?.drawn) {
    const drawnAt = firstHand.indexOf(start.drawn);
    if (drawnAt >= 0) {
      return firstHand.filter((_, index) => index !== drawnAt);
    }
  }
  return [...firstHand];
}

export function goFirstFromEvents(events: LineEvent[]): boolean {
  const start = events.find((event) => event.kind === "start");
  return !start?.drawn;
}

export function turnsFromEvents(events: LineEvent[]): number {
  let maxTurn = 1;
  for (const event of events) {
    if (event.turn > maxTurn) {
      maxTurn = event.turn;
    }
  }
  return maxTurn;
}

function slugifyFilenamePart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "line"
  );
}

export function lineTapePayload(
  events: LineEvent[],
  options?: { label?: string },
): LineTapePayload {
  const damage = events.at(-1)?.damage;
  return {
    version: 1,
    ...(options?.label ? { label: options.label } : {}),
    ...(damage != null ? { damage } : {}),
    hand: openingHandFromEvents(events),
    goFirst: goFirstFromEvents(events),
    turns: turnsFromEvents(events),
    events,
  };
}

export function formatLineTapeText(
  events: LineEvent[],
  catalog: CatalogEntry[],
  options?: { label?: string },
): string {
  const tape = expandEventZones(events);
  const lines: string[] = [];

  if (options?.label) {
    lines.push(options.label);
  }
  const damage = events.at(-1)?.damage;
  if (damage != null) {
    lines.push(`Damage: ${damage}`);
  }
  if (lines.length > 0) {
    lines.push("");
  }

  for (const [index, event] of tape.entries()) {
    lines.push(
      `${String(index).padStart(2, "0")} | ${formatLineEventRow(event, catalog)}`,
    );
  }

  const payload = lineTapePayload(events, options);
  lines.push("");
  lines.push(LINE_TAPE_PAYLOAD_MARKER);
  lines.push(JSON.stringify(payload));

  return `${lines.join("\n")}\n`;
}

export function lineTapeFilename(label: string, events: LineEvent[]): string {
  const damage = events.at(-1)?.damage;
  const slug = slugifyFilenamePart(label);
  return damage != null ? `${slug}-${damage}.txt` : `${slug}.txt`;
}

export function downloadLineTape(
  events: LineEvent[],
  catalog: CatalogEntry[],
  options?: { label?: string },
): void {
  if (events.length === 0) {
    return;
  }
  const label = options?.label ?? "Line";
  const content = formatLineTapeText(events, catalog, { label });
  const filename = lineTapeFilename(label, events);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
