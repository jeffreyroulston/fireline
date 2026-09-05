import type { PlaytestAction, PlaytestActionOption } from "@ga-fire/contracts";

/**
 * `playtest_legal_actions` returns one flat list for the whole board. The UI
 * needs the inverse: given a tile, which moves belong to it. This module is the
 * only place that mapping lives.
 *
 * Two rules hold everywhere below:
 *
 * - Nothing is synthesized. Every indexed option came back from the engine, so
 *   a target with no options is simply not playable this turn.
 * - Engine `label` strings are carried through verbatim. Wording follows the
 *   rules text, and the UI must not paraphrase it.
 *
 * HAND TARGETS KEY ON CARD ID, NOT HAND SLOT. The engine's play options name a
 * card (`action.card`) and never a slot, because a hand holding two copies of
 * Red Hare has exactly one set of legal plays for Red Hare. Keying on slot would
 * force us to invent a slot for each option. Clicking the second copy of a
 * duplicate therefore offers the same options as the first, which is correct:
 * the copies are interchangeable. Use {@link handTargetForSlot} to go from a
 * clicked slot to its target. Which physical copy leaves the hand is a payment
 * concern, settled later by `reserved_hand_indices` / `discard_hand_index`.
 */

/** The dagger is tracked as `dagger` on the board view, not as an equipped weapon. */
export const DAGGER_TARGET_ID = "poisoned_dagger";
export const RIPPER_TARGET_ID = "assassins_ripper";
export const MERCENARY_BLADE_TARGET_ID = "mercenary_blade";

export type ActionTarget =
  | { readonly kind: "hand"; readonly cardId: string }
  | { readonly kind: "ally"; readonly index: number }
  | { readonly kind: "allyRow" }
  | { readonly kind: "weapon"; readonly weaponId: string }
  | { readonly kind: "ring" }
  | { readonly kind: "material" }
  | { readonly kind: "phase" };

export type ActionTargetKind = ActionTarget["kind"];

/** Stable string form of a target, for map keys and React keys. */
export type ActionTargetKey = string;

export const ALLY_ROW_TARGET: ActionTarget = Object.freeze({ kind: "allyRow" });
export const RING_TARGET: ActionTarget = Object.freeze({ kind: "ring" });
export const MATERIAL_TARGET: ActionTarget = Object.freeze({ kind: "material" });
export const PHASE_TARGET: ActionTarget = Object.freeze({ kind: "phase" });

export function handTarget(cardId: string): ActionTarget {
  return { kind: "hand", cardId };
}

export function allyTarget(index: number): ActionTarget {
  return { kind: "ally", index };
}

export function weaponTarget(weaponId: string): ActionTarget {
  return { kind: "weapon", weaponId };
}

export function actionTargetKey(target: ActionTarget): ActionTargetKey {
  switch (target.kind) {
    case "hand":
      return `hand:${target.cardId}`;
    case "ally":
      return `ally:${target.index}`;
    case "weapon":
      return `weapon:${target.weaponId}`;
    case "allyRow":
    case "ring":
    case "material":
    case "phase":
      return target.kind;
  }
}

/**
 * Widen a clicked hand slot to its card-id target. Returns null for a slot that
 * is not in the hand, so callers cannot key on a phantom card.
 */
export function handTargetForSlot(
  hand: readonly string[],
  slot: number,
): ActionTarget | null {
  const cardId = hand[slot];
  return cardId == null ? null : handTarget(cardId);
}

/**
 * The board target an action belongs to, or null when the op is unrecognized.
 *
 * The `default` branch narrows `action` to `never`, so adding an op to
 * `PlaytestAction` without routing it here fails the typecheck rather than
 * quietly disappearing from the board.
 */
export function targetForAction(action: PlaytestAction): ActionTarget | null {
  switch (action.op) {
    case "playAlly":
    case "playItem":
    case "playAttack":
    case "playAction":
      return handTarget(action.card);

    case "attackArthur":
    case "activateSadi":
    case "activateArsonist":
      return allyTarget(action.index);

    // The engine picks which ally swings, so this belongs to the row, not a tile.
    case "attackOthers":
      return ALLY_ROW_TARGET;

    case "attackWithWeapon":
    case "blazingThrow":
      return weaponTarget(action.weapon);
    case "activateDagger":
      return weaponTarget(DAGGER_TARGET_ID);
    case "activateRipper":
      return weaponTarget(RIPPER_TARGET_ID);
    // Prep-paid materialize, but it lands on the blade tile the player is aiming at.
    case "mercenaryBlade":
      return weaponTarget(MERCENARY_BLADE_TARGET_ID);

    case "materializeRing":
    case "banishCrusaderRing":
      return RING_TARGET;

    case "materializeHammer":
    case "materializeDagger":
    case "materializeSoulknife":
    case "materializeRipper":
    case "materializeZanderMemory":
    case "materializeTristanMemory":
      return MATERIAL_TARGET;

    case "pass":
    case "skipMaterialize":
    case "skipPreRecollect":
    case "skipAgility":
    case "tristanRecollect":
      return PHASE_TARGET;

    default:
      return unroutedOp(action);
  }
}

function unroutedOp(action: never): null {
  void action;
  return null;
}

export function targetForOption(option: PlaytestActionOption): ActionTarget | null {
  return targetForAction(option.action);
}

/** One engine option, plus where it sat in the legal-actions list. */
export type IndexedActionOption = Readonly<{
  option: PlaytestActionOption;
  /** Position in the source array, so a caller can round-trip to the original. */
  optionIndex: number;
  /** `option.label`, verbatim from the engine. */
  label: string;
}>;

/**
 * A board target and every option the engine offered for it. Several options on
 * one target are variants: kindle amount, `prepared`, `doubled`, weapon `wield`,
 * `sacrifice_ally`, `flagrant_level`, `tristan_agility`, and Glimpse layout each
 * produce a distinct entry with its own label.
 */
export type ActionTargetEntry = Readonly<{
  key: ActionTargetKey;
  target: ActionTarget;
  options: readonly IndexedActionOption[];
}>;

export type ActionTargetIndex = Readonly<{
  /** Targets in first-seen engine order. */
  targets: readonly ActionTargetEntry[];
  byKey: ReadonlyMap<ActionTargetKey, ActionTargetEntry>;
  /** Options whose op this build does not route. Empty against a matching engine. */
  unrouted: readonly IndexedActionOption[];
}>;

const NO_OPTIONS: readonly IndexedActionOption[] = Object.freeze([]);

export function buildActionTargetIndex(
  options: readonly PlaytestActionOption[],
): ActionTargetIndex {
  const order: ActionTargetKey[] = [];
  const grouped = new Map<
    ActionTargetKey,
    { target: ActionTarget; options: IndexedActionOption[] }
  >();
  const unrouted: IndexedActionOption[] = [];

  options.forEach((option, optionIndex) => {
    const entry: IndexedActionOption = { option, optionIndex, label: option.label };
    const target = targetForOption(option);
    if (target == null) {
      unrouted.push(entry);
      return;
    }
    const key = actionTargetKey(target);
    let bucket = grouped.get(key);
    if (bucket == null) {
      bucket = { target, options: [] };
      grouped.set(key, bucket);
      order.push(key);
    }
    bucket.options.push(entry);
  });

  const byKey = new Map<ActionTargetKey, ActionTargetEntry>();
  const targets: ActionTargetEntry[] = order.map((key) => {
    const bucket = grouped.get(key)!;
    const entry: ActionTargetEntry = Object.freeze({
      key,
      target: bucket.target,
      options: Object.freeze(bucket.options),
    });
    byKey.set(key, entry);
    return entry;
  });

  return Object.freeze({
    targets: Object.freeze(targets),
    byKey,
    unrouted: Object.freeze(unrouted),
  });
}

export function optionsForKey(
  index: ActionTargetIndex,
  key: ActionTargetKey,
): readonly IndexedActionOption[] {
  return index.byKey.get(key)?.options ?? NO_OPTIONS;
}

export function optionsForTarget(
  index: ActionTargetIndex,
  target: ActionTarget,
): readonly IndexedActionOption[] {
  return optionsForKey(index, actionTargetKey(target));
}

/** Options for a clicked hand slot. Duplicate copies resolve to the same list. */
export function optionsForHandSlot(
  index: ActionTargetIndex,
  hand: readonly string[],
  slot: number,
): readonly IndexedActionOption[] {
  const target = handTargetForSlot(hand, slot);
  return target == null ? NO_OPTIONS : optionsForTarget(index, target);
}

/** A target with no engine options is not playable. Never render it as clickable. */
export function isTargetPlayable(
  index: ActionTargetIndex,
  target: ActionTarget,
): boolean {
  return optionsForTarget(index, target).length > 0;
}

/** True when a target offers a choice and the UI should open a variant menu. */
export function hasVariantChoice(
  index: ActionTargetIndex,
  target: ActionTarget,
): boolean {
  return optionsForTarget(index, target).length > 1;
}
