import type { SavedDeck } from "@/lib/decks";

export function DeckPicker({
  label,
  decks,
  value,
  onChange,
  emptyLabel = "No saved decks",
  formatOption,
  disabled,
}: {
  label: string;
  decks: SavedDeck[];
  value: string;
  onChange: (deckId: string) => void;
  emptyLabel?: string;
  formatOption?: (deck: SavedDeck) => string;
  disabled?: boolean;
}) {
  const isDisabled = disabled ?? decks.length === 0;

  return (
    <label className="deck-picker">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
        autoComplete="off"
      >
        {decks.length === 0 && <option value="">{emptyLabel}</option>}
        {decks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {formatOption ? formatOption(deck) : deck.name}
          </option>
        ))}
      </select>
    </label>
  );
}
