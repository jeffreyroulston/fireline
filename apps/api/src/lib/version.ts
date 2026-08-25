/** Engine version triple used for cross-run pooling (excludes attribution). */
export interface VersionTriple {
  rulesVersion: number;
  samplerVersion: number;
  cardDigest: string;
}

export interface VersionTripleWithAttribution extends VersionTriple {
  attributionVersion: number;
}

export function parseVersionTriple(
  params: URLSearchParams,
): VersionTriple | { error: string } {
  const rulesRaw = params.get("rules_version");
  const samplerRaw = params.get("sampler_version");
  const cardDigest = params.get("card_digest")?.trim();

  if (!rulesRaw || !samplerRaw || !cardDigest) {
    return {
      error:
        "rules_version, sampler_version, and card_digest are required so runs are never pooled across engine versions",
    };
  }

  const rulesVersion = Number(rulesRaw);
  const samplerVersion = Number(samplerRaw);
  if (!Number.isInteger(rulesVersion) || !Number.isInteger(samplerVersion)) {
    return { error: "rules_version and sampler_version must be integers" };
  }

  return { rulesVersion, samplerVersion, cardDigest };
}

export function parseAttributionVersion(
  params: URLSearchParams,
): number | { error: string } {
  const raw = params.get("attribution_version");
  if (!raw) {
    return {
      error:
        "attribution_version is required for card leaderboard aggregation",
    };
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return { error: "attribution_version must be an integer" };
  }
  return value;
}
