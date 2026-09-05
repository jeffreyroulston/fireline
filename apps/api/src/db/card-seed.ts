import { GENERATED_CARD_SEED } from "./generated/card-seed-data";

export type CardSeed = {
  id: string;
  name: string;
  short: string;
  kind: string;
  cost: number;
  element: string;
  power?: number;
  life?: number;
  stealth?: boolean;
  unique?: boolean;
  assassinPowerBonus?: number;
  assassinStealth?: boolean;
  automaton?: boolean;
  fast?: boolean;
  floatingMemory?: boolean;
  kindle?: number;
  prepare?: number;
  aliases: string[];
};

/** Maindeck catalog — synced from the Rust engine via `pnpm sync:cards`. */
export const CARD_SEED: CardSeed[] = GENERATED_CARD_SEED.map((card) => ({
  ...card,
  aliases: [...card.aliases],
}));

export const MATERIAL_SEED: CardSeed[] = [
  {
    id: "impact_hammer",
    name: "Impact Hammer",
    short: "IHamm",
    kind: "material",
    cost: 0,
    element: "fire",
    aliases: [],
  },
  {
    id: "mercenary_blade",
    name: "Mercenary's Blade",
    short: "MBlad",
    kind: "material",
    cost: 0,
    element: "norm",
    aliases: [],
  },
  {
    id: "poisoned_dagger",
    name: "Poisoned Dagger",
    short: "PDagg",
    kind: "material",
    cost: 0,
    element: "fire",
    aliases: [],
  },
  {
    id: "zander_1",
    name: "Zander, Prepared Scout",
    short: "Zande",
    kind: "material",
    cost: 0,
    element: "fire",
    unique: true,
    aliases: ["zander"],
  },
  {
    id: "zander_2",
    name: "Zander, Deft Executor",
    short: "ZDeft",
    kind: "material",
    cost: 0,
    element: "norm",
    unique: true,
    aliases: ["zander_deft_executor"],
  },
  {
    id: "varuckan_soulknife",
    name: "Varuckan Soulknife",
    short: "VSoul",
    kind: "material",
    cost: 0,
    element: "fire",
    aliases: [],
  },
  {
    id: "tristan_1",
    name: "Tristan, Underhanded",
    short: "Trist",
    kind: "material",
    cost: 0,
    element: "fire",
    unique: true,
    aliases: ["tristan"],
  },
  {
    id: "assassins_ripper",
    name: "Assassin's Ripper",
    short: "ARipp",
    kind: "material",
    cost: 0,
    element: "norm",
    aliases: ["assassins_ripper", "ripper"],
  },
  {
    id: "grand_crusaders_ring",
    name: "Grand Crusader's Ring",
    short: "GCRin",
    kind: "material",
    cost: 0,
    element: "norm",
    unique: true,
    aliases: ["grand_crusaders_ring", "crusaders_ring"],
  },
];

export const MATERIAL_CARD_IDS = MATERIAL_SEED.map((card) => card.id);

export function isMaterialCardId(id: string): boolean {
  return MATERIAL_CARD_IDS.includes(id);
}
