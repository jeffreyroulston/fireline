import { MIN_VALID_DECK_SIZE } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { DeckPicker, SectionHeading } from "../../ui";
import { ratioPanelClass, ratioRefineHintClass } from "./shared";

type RatioDeckPickerProps = Readonly<{
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedCount: number;
  onSwitchDeck: (deckId: string) => void;
  decksLoading?: boolean;
}>;

export function RatioDeckPicker({
  decks,
  activeDeck,
  recognizedCount,
  onSwitchDeck,
  decksLoading = false,
}: RatioDeckPickerProps) {
  return (
    <div className={ratioPanelClass}>
      <SectionHeading
        title="BASE DECK"
        meta={<strong>{recognizedCount} recognized</strong>}
      />
      <DeckPicker
        label="Saved deck to refine"
        decks={decks}
        value={activeDeck?.id ?? ""}
        onChange={onSwitchDeck}
        loading={decksLoading}
      />
      {recognizedCount > 0 && recognizedCount < MIN_VALID_DECK_SIZE && (
        <p className={ratioRefineHintClass} role="status">
          Need at least {MIN_VALID_DECK_SIZE} recognized cards to sample ratios.
        </p>
      )}
    </div>
  );
}
