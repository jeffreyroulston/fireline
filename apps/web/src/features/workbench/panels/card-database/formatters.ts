import type { TapePhase } from "@ga-fire/contracts";
import type { CardDatabasePairingRow } from "@/lib/api/client";
import { PHASE_LABELS } from "../../types";
import type { PartnerMode } from "./constants";
import { formatRunTimestamp } from "./shared";

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function formatDmg(value: number): string {
  return value.toFixed(1);
}

export function formatSigned(value: number, digits = 0): string {
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) {
    return `+${abs}`;
  }
  if (value < 0) {
    return `−${abs}`;
  }
  return digits === 0 ? "0" : (0).toFixed(digits);
}

export function formatLift(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const text = abs.toFixed(1);
  return value > 0 ? `+${text}` : `−${text}`;
}

export { deltaTextClass as deltaTone } from "@/lib/utils/ui-classes";

export function partnerDelta(
  row: CardDatabasePairingRow,
  mode: PartnerMode,
): number {
  return mode === "pairs_with_me"
    ? row.pairsWithMeDelta
    : row.dependsOnMeDelta;
}

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase as TapePhase] ?? phase;
}

export const PHASE_ORDER = Object.keys(PHASE_LABELS) as TapePhase[];

export function phaseRank(phase: string): number {
  const index = PHASE_ORDER.indexOf(phase as TapePhase);
  return index === -1 ? PHASE_ORDER.length : index;
}

export function formatKindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function formatRunLabel(run: {
  deckName: string;
  startedAt: string;
}): string {
  return `${run.deckName} · ${formatRunTimestamp(run.startedAt)}`;
}
