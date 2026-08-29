import type { SavedDeck } from "@/lib/decks";
import { cn } from "@/lib/utils/cn";

export function DeckPicker({
  label,
  decks,
  value,
  onChange,
  emptyLabel = "No saved decks",
  loadingLabel = "Loading decks…",
  loading = false,
  formatOption,
  disabled,
  className,
}: {
  label: string;
  decks: SavedDeck[];
  value: string;
  onChange: (deckId: string) => void;
  emptyLabel?: string;
  loadingLabel?: string;
  loading?: boolean;
  formatOption?: (deck: SavedDeck) => string;
  disabled?: boolean;
  className?: string;
}) {
  const isDisabled = disabled ?? (loading ? true : decks.length === 0);
  const emptyOptionLabel =
    loading || (value && decks.length === 0) ? loadingLabel : emptyLabel;

  return (
    <label className={cn("min-w-[180px] flex-1", className)}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
        autoComplete="off"
      >
        {decks.length === 0 && (
          <option value={value}>{emptyOptionLabel}</option>
        )}
        {decks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {formatOption ? formatOption(deck) : deck.name}
          </option>
        ))}
      </select>
    </label>
  );
}
