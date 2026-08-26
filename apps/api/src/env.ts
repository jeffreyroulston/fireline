import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Load apps/api/.env into process.env if present (does not override existing vars). */
function loadDotEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return;
  }
}

loadDotEnv();

export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value == null) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
