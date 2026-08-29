import { CARDS, PLAYABLE_CARD_IDS, type CardId, type DeckCounts } from "@/lib/engine";
import { SectionHeading } from "../../ui";
import { ratioCutGridClass, ratioPanelClass, ratioRefineHintClass } from "./shared";

type CutBudgetPanelProps = Readonly<{
  baseCounts: DeckCounts;
  cutBudgets: Partial<Record<CardId, number>>;
  onCutBudgetChange: (id: CardId, cutUpTo: number) => void;
}>;

export function CutBudgetPanel({
  baseCounts,
  cutBudgets,
  onCutBudgetChange,
}: CutBudgetPanelProps) {
  const rows = PLAYABLE_CARD_IDS.filter((id) => (baseCounts[id] ?? 0) > 0).sort(
    (a, b) => CARDS[a].name.localeCompare(CARDS[b].name),
  );

  if (rows.length === 0) {
    return (
      <div className={ratioPanelClass}>
        <SectionHeading title="CUT BUDGETS" meta={<strong>0 cards</strong>} />
        <p className={ratioRefineHintClass}>Select a saved deck to flag cuts.</p>
      </div>
    );
  }

  return (
    <div className={ratioPanelClass}>
      <SectionHeading
        title="CUT BUDGETS"
        meta={
          <strong>
            {rows.filter((id) => (cutBudgets[id] ?? 0) > 0).length} flexible
          </strong>
        }
      />
      <p className={ratioRefineHintClass}>
        Raise “cut up to” on cards you are willing to trim. Freed slots are
        filled from the replacement pool below.
      </p>
      <div className="border-t border-foreground">
        <div
          className={`${ratioCutGridClass} m-0 border-b border-border py-3 font-mono text-[10px] tracking-[0.08em] text-muted uppercase`}
        >
          <span>Card</span>
          <span>In list</span>
          <span>Cut up to</span>
        </div>
        {rows.map((id) => {
          const count = baseCounts[id] ?? 0;
          const cut = Math.min(count, Math.max(0, cutBudgets[id] ?? 0));
          return (
            <div className={`${ratioCutGridClass} border-b border-border py-2`} key={id}>
              <span className="grid">
                <b className="text-[13px]">{CARDS[id].name}</b>
                <small className="font-mono text-[9px] text-muted uppercase">
                  {CARDS[id].kind}
                </small>
              </span>
              <span className="font-mono text-[13px] text-muted">{count}×</span>
              <input
                aria-label={`${CARDS[id].name} cut up to`}
                type="number"
                min={0}
                max={count}
                value={cut}
                onChange={(event) =>
                  onCutBudgetChange(id, Number(event.target.value))
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
