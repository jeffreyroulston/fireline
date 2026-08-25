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
