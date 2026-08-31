export type PartnerMode = "pairs_with_me" | "depends_on_me";

export const CARD_DB_SOURCES = [
  { id: "all" as const, label: "All" },
  { id: "evaluate" as const, label: "Evaluate" },
  { id: "swap_sweep" as const, label: "Swap sweep" },
];

export const KIND_FILTERS = ["ally", "attack", "action", "item"] as const;

export const PARTNER_MODES: Array<{ id: PartnerMode; label: string }> = [
  { id: "pairs_with_me", label: "Pairs with me" },
  { id: "depends_on_me", label: "Who depends on me" },
];
