import type { SeatId } from "@/lib/api/duels";

const COOKIE_NAME = "ga_duel_rejoin";
const MAX_AGE_SEC = 60 * 60 * 24; // 24h

export type DuelRejoinCookie = {
  code: string;
  clientId: string;
  seat: SeatId;
};

function parseCookieValue(raw: string): DuelRejoinCookie | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DuelRejoinCookie>;
    if (
      typeof parsed.code !== "string" ||
      typeof parsed.clientId !== "string" ||
      (parsed.seat !== "A" && parsed.seat !== "B")
    ) {
      return null;
    }
    return {
      code: parsed.code.toUpperCase(),
      clientId: parsed.clientId,
      seat: parsed.seat,
    };
  } catch {
    return null;
  }
}

export function readDuelRejoinCookie(): DuelRejoinCookie | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq);
    if (name !== COOKIE_NAME) continue;
    return parseCookieValue(decodeURIComponent(part.slice(eq + 1)));
  }
  return null;
}

export function writeDuelRejoinCookie(value: DuelRejoinCookie): void {
  if (typeof document === "undefined") return;
  const payload = encodeURIComponent(
    JSON.stringify({
      code: value.code.toUpperCase(),
      clientId: value.clientId,
      seat: value.seat,
    }),
  );
  document.cookie = `${COOKIE_NAME}=${payload}; Path=/play; Max-Age=${MAX_AGE_SEC}; SameSite=Lax`;
}

export function clearDuelRejoinCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; Path=/play; Max-Age=0; SameSite=Lax`;
}
