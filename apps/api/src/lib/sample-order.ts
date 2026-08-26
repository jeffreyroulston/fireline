import { handHash } from "./deck.js";

/** Match the engine's `Rng` (splitmix64-style) for deterministic sample replay. */
class Rng {
  private state: bigint;

  constructor(seed: bigint | number | string) {
    this.state = BigInt(seed);
  }

  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return (z ^ (z >> 31n)) & 0xffffffffffffffffn;
  }

  index(len: number): number {
    return Number(this.next() % BigInt(len));
  }
}

function shuffle<T>(values: T[], rng: Rng): void {
  for (let index = values.length - 1; index >= 1; index -= 1) {
    const swapIndex = rng.index(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

/** Expand deck counts in BTreeMap key order, matching the engine's `parse_counts`. */
function buildDeckFromCounts(counts: Record<string, number>): string[] {
  const deck: string[] = [];
  for (const id of Object.keys(counts).sort()) {
    const count = counts[id] ?? 0;
    for (let n = 0; n < count; n += 1) {
      deck.push(id);
    }
  }
  return deck;
}

function drawOpeningHand(deck: string[], rng: Rng): string[] {
  const shuffled = [...deck];
  shuffle(shuffled, rng);
  return shuffled.slice(0, 7);
}

/** Reconstruct the opening hand drawn at a given sample index. */
export function reconstructSampleHand(options: {
  deckCounts: Record<string, number>;
  rootSeed: string | number | bigint | null;
  sampleIndex: number;
}): string[] | null {
  const { deckCounts, rootSeed, sampleIndex } = options;
  if (rootSeed == null || sampleIndex < 0) {
    return null;
  }

  const deck = buildDeckFromCounts(deckCounts);
  if (deck.length < 7) {
    return null;
  }

  const rng = new Rng(rootSeed);
  for (let index = 0; index < sampleIndex; index += 1) {
    drawOpeningHand(deck, rng);
  }
  return drawOpeningHand(deck, rng);
}

/**
 * Reconstruct per-sample damages in draw order for runs saved before
 * `sample_damages` existed, using root seed + stored hand results.
 */
export function reconstructSampleDamages(options: {
  deckCounts: Record<string, number>;
  rootSeed: string | number | bigint | null;
  samples: number;
  handDamages: Map<string, number>;
}): number[] | null {
  const { deckCounts, rootSeed, samples, handDamages } = options;
  if (rootSeed == null || samples <= 0 || handDamages.size === 0) {
    return null;
  }

  const deck = buildDeckFromCounts(deckCounts);
  if (deck.length < 7) {
    return null;
  }

  const rng = new Rng(rootSeed);
  const damages: number[] = [];

  for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
    const drawn = drawOpeningHand(deck, rng);
    const hash = handHash(drawn);
    const damage = handDamages.get(hash);
    if (damage === undefined) {
      return null;
    }
    damages.push(damage);
  }

  return damages;
}
