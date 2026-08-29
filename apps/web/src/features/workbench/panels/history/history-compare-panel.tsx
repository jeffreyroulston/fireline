import { type SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import type { VersionGroup } from "@/lib/api/client";
import { SIM_TYPE_LABELS } from "../../types";
import {
  errorBannerClass,
  historyCompareKickerClass,
  historyComparePanelClass,
  historyControlsClass,
  simHintClass,
} from "./shared";
import { formatVersionLabel, groupKey } from "./shared";

type HistoryComparePanelProps = Readonly<{
  decks: SavedDeck[];
  compareDeckId: string;
  compareSimType: SimType;
  compareGroupKey: string;
  compareGroups: VersionGroup[];
  compareLoading: boolean;
  compareError: string;
  onCompareDeckChange: (deckId: string) => void;
  onCompareSimTypeChange: (simType: SimType) => void;
  onCompareGroupKeyChange: (groupKey: string) => void;
}>;

export function HistoryComparePanel({
  decks,
  compareDeckId,
  compareSimType,
  compareGroupKey,
  compareGroups,
  compareLoading,
  compareError,
  onCompareDeckChange,
  onCompareSimTypeChange,
  onCompareGroupKeyChange,
}: HistoryComparePanelProps) {
  return (
    <div className={historyComparePanelClass}>
      <p className={historyCompareKickerClass}>COMPARE AGAINST</p>
      <div className={historyControlsClass}>
        <label>
          Deck
          <select
            value={compareDeckId}
            onChange={(event) => onCompareDeckChange(event.target.value)}
          >
            <option value="">Choose a deck</option>
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
            value={compareSimType}
            disabled={!compareDeckId}
            onChange={(event) =>
              onCompareSimTypeChange(event.target.value as SimType)
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
            value={compareDeckId ? compareGroupKey : ""}
            disabled={!compareDeckId || compareGroups.length === 0}
            onChange={(event) => onCompareGroupKeyChange(event.target.value)}
          >
            {!compareDeckId && <option value="">Choose a deck</option>}
            {compareDeckId && compareGroups.length === 0 && (
              <option value="">No completed evaluate runs</option>
            )}
            {compareDeckId &&
              compareGroups.map((group) => (
                <option key={groupKey(group)} value={groupKey(group)}>
                  {formatVersionLabel(group)} · {group.runCount} runs
                </option>
              ))}
          </select>
        </label>
      </div>
      {compareLoading && <p className={simHintClass}>Loading compare pool…</p>}
      {compareError && (
        <p className={errorBannerClass} role="alert">
          {compareError}
        </p>
      )}
    </div>
  );
}
