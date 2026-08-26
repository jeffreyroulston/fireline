interface StepLike {
  action: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `action` is casting/playing `name` from hand.
 * Matches Activate / Fast Activate labels (allies/items) and bare cast labels
 * (attacks/actions). Does not match "Attack from …" — that is using a board
 * ally, not a hand play.
 *
 * Labels often put a space before modifiers: "Activate X (Kindle 1)",
 * "Ignited Stab (prepared)". Fast allies during materialize use
 * "Fast Activate X".
 */
function isHandPlayAction(action: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  const afterName = String.raw`(?:\s*\(|$)`;
  return (
    new RegExp(`^(?:Fast )?Activate ${escaped}${afterName}`).test(action) ||
    new RegExp(`^${escaped}${afterName}`).test(action)
  );
}

function countHandPlays(
  steps: StepLike[],
  name: string,
): number {
  let plays = 0;
  for (const step of steps) {
    if (isHandPlayAction(step.action, name)) {
      plays += 1;
    }
  }
  return plays;
}

/**
 * Opening-hand card ids where every opening copy was played on the stored line.
 * Partial plays (e.g. unique 2-of, only one Activate) are omitted so callers can
 * treat them as in-hand-not-fully-played — matching Play|hand's per-copy math.
 */
export function playedOpeningCards(
  openingHand: string[],
  steps: StepLike[] | null | undefined,
  cardNames: Record<string, string>,
): string[] {
  if (!steps || steps.length === 0) {
    return [];
  }

  const openingCopies = new Map<string, number>();
  for (const cardId of openingHand) {
    openingCopies.set(cardId, (openingCopies.get(cardId) ?? 0) + 1);
  }

  const played: string[] = [];
  for (const [cardId, copies] of openingCopies) {
    const name = cardNames[cardId] ?? cardId;
    if (countHandPlays(steps, name) >= copies) {
      played.push(cardId);
    }
  }

  return played;
}
