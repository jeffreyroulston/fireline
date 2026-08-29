import type { SavedMaterialDeck } from "@/lib/material-decks";
import { SearchableSelect } from "./searchable-select";

export function MaterialDeckPicker({
  label,
  decks,
  value,
  onChange,
  emptyLabel = "No material decks",
  loadingLabel = "Loading material decks…",
  loading = false,
  formatOption,
  disabled,
  className,
}: {
  label: string;
  decks: SavedMaterialDeck[];
  value: string;
  onChange: (deckId: string) => void;
  emptyLabel?: string;
  loadingLabel?: string;
  loading?: boolean;
  formatOption?: (deck: SavedMaterialDeck) => string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <SearchableSelect
      label={label}
      options={decks.map((deck) => ({
        value: deck.id,
        label: formatOption ? formatOption(deck) : deck.name,
        keywords: deck.name,
      }))}
      value={value}
      onChange={onChange}
      emptyLabel={emptyLabel}
      loadingLabel={loadingLabel}
      loading={loading}
      disabled={disabled}
      placeholder="Search material decks…"
      className={className}
    />
  );
}
