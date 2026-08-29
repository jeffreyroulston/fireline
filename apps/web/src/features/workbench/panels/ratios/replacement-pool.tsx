import { CARDS, PLAYABLE_CARD_IDS, type CardId, type DeckCounts } from "@/lib/engine";
import { SectionHeading } from "../../ui";
import { REFINE_COPY_CEILING } from "../../utils";
import {
  ratioPanelClass,
  ratioRefineHintClass,
  ratioReplaceChipClass,
} from "./shared";

type ReplacementPoolPanelProps = Readonly<{
  baseCounts: DeckCounts;
  replacements: Partial<Record<CardId, number>>;
  onToggle: (id: CardId) => void;
  onMaxChange: (id: CardId, max: number) => void;
}>;

export function ReplacementPoolPanel({
  baseCounts,
  replacements,
  onToggle,
  onMaxChange,
}: ReplacementPoolPanelProps) {
  const sorted = PLAYABLE_CARD_IDS.filter(
    (id) => (baseCounts[id] ?? 0) < REFINE_COPY_CEILING,
  ).sort((a, b) => CARDS[a].name.localeCompare(CARDS[b].name));
  const allowedCount = Object.keys(replacements).filter(
    (id) => (baseCounts[id as CardId] ?? 0) < REFINE_COPY_CEILING,
  ).length;

  return (
    <div className={ratioPanelClass}>
      <SectionHeading
        title="REPLACEMENT POOL"
        meta={<strong>{allowedCount} allowed</strong>}
      />
      <p className={ratioRefineHintClass}>
        Any freed cut slots can be filled by these cards. Cards already at 4
        copies are hidden. Set a max copies per card (default 4).
      </p>
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2"
        role="group"
        aria-label="Replacement cards"
      >
        {sorted.map((id) => {
          const max = replacements[id];
          const checked = max != null;
          return (
            <div key={id} className={ratioReplaceChipClass(checked)}>
              <label className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-2.5">
                <input
                  className="mt-[3px]"
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(id)}
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
              {checked && (
                <label className="grid grid-cols-[auto_64px] items-center gap-2 font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
                  Max
                  <input
                    className="w-16"
                    aria-label={`${CARDS[id].name} max copies`}
                    type="number"
                    min={1}
                    max={4}
                    value={max}
                    onChange={(event) =>
                      onMaxChange(id, Number(event.target.value))
                    }
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
