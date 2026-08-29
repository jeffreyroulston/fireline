import { CARDS, PLAYABLE_CARD_IDS, type CardId, type DeckCounts } from "@/lib/engine";
import { SectionHeading } from "../../ui";
import {
  ratioPanelClass,
  ratioRefineHintClass,
  ratioReplaceChipClass,
} from "./shared";

type SwapSweepPanelProps = Readonly<{
  baseCounts: DeckCounts;
  swapFrom: CardId | "";
  swapCount: number;
  candidates: Partial<Record<CardId, boolean>>;
  onSwapFromChange: (id: CardId) => void;
  onSwapCountChange: (count: number) => void;
  onToggleCandidate: (id: CardId) => void;
}>;

export function SwapSweepPanel({
  baseCounts,
  swapFrom,
  swapCount,
  candidates,
  onSwapFromChange,
  onSwapCountChange,
  onToggleCandidate,
}: SwapSweepPanelProps) {
  const swappable = PLAYABLE_CARD_IDS.filter((id) => (baseCounts[id] ?? 0) > 0).sort(
    (a, b) => CARDS[a].name.localeCompare(CARDS[b].name),
  );
  const fromCount = swapFrom ? (baseCounts[swapFrom] ?? 0) : 0;
  const eligibleCandidates = PLAYABLE_CARD_IDS.filter(
    (id) =>
      id !== swapFrom &&
      (baseCounts[id] ?? 0) === 0 &&
      swapCount >= 1 &&
      swapCount <= 4,
  ).sort((a, b) => CARDS[a].name.localeCompare(CARDS[b].name));
  const candidateIds = eligibleCandidates.filter((id) => candidates[id]);

  return (
    <div className={ratioPanelClass}>
      <SectionHeading
        title="SWAP SWEEP"
        meta={<strong>{candidateIds.length} candidates</strong>}
      />
      <p className={ratioRefineHintClass}>
        Cut copies of one card from your list and try each candidate at the same
        count. Only cards not already in the deck are shown below.
      </p>
      <div className="mb-[18px] flex items-end gap-3">
        <label className="min-w-[min(280px,100%)]">
          Swappable card
          <select
            value={swapFrom}
            onChange={(event) => onSwapFromChange(event.target.value as CardId)}
          >
            <option value="">Select a card…</option>
            {swappable.map((id) => (
              <option key={id} value={id}>
                {CARDS[id].name} · {baseCounts[id]}×
              </option>
            ))}
          </select>
        </label>
        <label>
          Swap count
          <input
            type="number"
            min={1}
            max={Math.max(1, fromCount, 4)}
            value={swapCount}
            disabled={!swapFrom}
            onChange={(event) => onSwapCountChange(Number(event.target.value))}
          />
        </label>
      </div>
      {!swapFrom ? (
        <p className={`${ratioRefineHintClass} mt-0`}>
          Pick a card to swap out before choosing candidates.
        </p>
      ) : eligibleCandidates.length === 0 ? (
        <p className={`${ratioRefineHintClass} mt-0`}>
          No playable cards outside this deck match the swap count.
        </p>
      ) : (
        <div
          className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2"
          role="group"
          aria-label="Swap candidates"
        >
          {eligibleCandidates.map((id) => {
            const checked = candidates[id] === true;
            return (
              <div key={id} className={ratioReplaceChipClass(checked)}>
                <label className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-2.5">
                  <input
                    className="mt-[3px]"
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCandidate(id)}
                  />
                  <span className="grid gap-0.5">
                    <b className="text-[13px] leading-tight font-semibold">
                      {CARDS[id].name}
                    </b>
                    <small className="font-mono text-[9px] text-muted uppercase">
                      {CARDS[id].kind}
                    </small>
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
