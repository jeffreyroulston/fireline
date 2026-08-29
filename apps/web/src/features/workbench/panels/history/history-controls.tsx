import { type SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import type { VersionGroup } from "@/lib/api/client";
import { SIM_TYPE_LABELS } from "../../types";
import { historyControlsClass } from "./shared";
import { formatVersionLabel, groupKey } from "./shared";

type HistoryControlsProps = Readonly<{
  decks: SavedDeck[];
  filterDeckId: string | null;
  simType: SimType;
  selectedDeck: SavedDeck | null;
  groups: VersionGroup[];
  selectedGroupKey: string;
  onFilterDeckChange: (deckId: string | null) => void;
  onSimTypeChange: (simType: SimType) => void;
  onGroupKeyChange: (groupKey: string) => void;
}>;

export function HistoryControls({
  decks,
  filterDeckId,
  simType,
  selectedDeck,
  groups,
  selectedGroupKey,
  onFilterDeckChange,
  onSimTypeChange,
  onGroupKeyChange,
}: HistoryControlsProps) {
  return (
    <div className={historyControlsClass}>
      <label>
        Deck
        <select
          value={filterDeckId ?? "all"}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "all") {
              onFilterDeckChange(null);
              return;
            }
            onFilterDeckChange(value);
          }}
        >
          <option value="all">All decks</option>
          {decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sim type
        <select
          value={simType}
          onChange={(event) =>
            onSimTypeChange(event.target.value as SimType)
          }
        >
          {(Object.keys(SIM_TYPE_LABELS) as SimType[]).map((id) => (
            <option key={id} value={id}>
              {SIM_TYPE_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Version group
        <select
          value={selectedDeck ? selectedGroupKey : ""}
          disabled={!selectedDeck || groups.length === 0}
          onChange={(event) => onGroupKeyChange(event.target.value)}
        >
          {!selectedDeck && <option value="">Pick a deck to pool</option>}
          {selectedDeck && groups.length === 0 && (
            <option value="">No completed evaluate runs</option>
          )}
          {selectedDeck &&
            groups.map((group) => (
              <option key={groupKey(group)} value={groupKey(group)}>
                {formatVersionLabel(group)} · {group.runCount} runs
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
