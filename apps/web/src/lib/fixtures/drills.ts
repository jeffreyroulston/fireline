import type { CardId } from "../engine/types";

/** Drill #3 from mathematically_correct_fiza_examples/2.html — expected max damage 20. */
export const DRILL_3_HAND: CardId[] = [
  "rending_flames",
  "arthur",
  "hasty_messenger",
  "kingdom_informant",
  "ignited_stab",
  "sable_remnant",
  "clumsy_apprentice",
];

export const DRILL_3_EXPECTED = 20;

/** Drill #1-style opener from examples index — expected 24. */
export const DRILL_1_HAND: CardId[] = [
  "blazing_throw",
  "arthur",
  "red_hare",
  "arthur",
  "blazing_throw",
  "kingdom_informant",
  "kingdom_informant",
];

export const DRILL_1_EXPECTED = 24;
