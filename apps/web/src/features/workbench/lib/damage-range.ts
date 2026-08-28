export type DamageRange = {
  gte?: number;
  lte?: number;
};

function parseBound(raw: string): { value?: number; error: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: false };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { error: true };
  }
  return { value, error: false };
}

/** Inclusive min/max from two number fields. Empty fields are open. */
export function parseDamageRange(
  minRaw: string,
  maxRaw: string,
): {
  range: DamageRange | null;
  error: string | null;
} {
  const min = parseBound(minRaw);
  const max = parseBound(maxRaw);
  if (min.error || max.error) {
    return { range: null, error: "Min and max need to be numbers." };
  }
  if (min.value != null && max.value != null && min.value > max.value) {
    return { range: null, error: "Min is above max." };
  }
  if (min.value == null && max.value == null) {
    return { range: null, error: null };
  }
  return {
    range: {
      ...(min.value != null ? { gte: min.value } : {}),
      ...(max.value != null ? { lte: max.value } : {}),
    },
    error: null,
  };
}

export function damageMatchesRange(
  damage: number,
  range: DamageRange | null,
): boolean {
  if (!range) {
    return true;
  }
  if (range.gte != null && damage < range.gte) {
    return false;
  }
  if (range.lte != null && damage > range.lte) {
    return false;
  }
  return true;
}
