import { InfoPopover } from "@/components/info-popover";
import { pillTabListClass, pillTabVariants } from "@/lib/utils";
import type { RatioStrategy } from "../../types";

const RATIO_STRATEGIES: {
  id: RatioStrategy;
  label: string;
  help: string;
}[] = [
  {
    id: "randomSample",
    label: "Random sample",
    help: "Picks random legal decklists that fit your cut and replacement rules. Good default — tries many different mixes without checking every possible list.",
  },
  {
    id: "hillClimb",
    label: "Hill climb",
    help: "Starts with a list and keeps making small tweaks (swap one copy of a card for another) whenever damage goes up. Restarts when it gets stuck. With SPRT scoring, unpromising neighbors stop early so you can screen more directions.",
  },
  {
    id: "genetic",
    label: "Genetic",
    help: "Keeps a pool of lists, mixes the best ones together, and adds random changes. Casts a wider net than hill climb when you want to explore more unusual ratios. SPRT scoring can reject weak children before a full run.",
  },
  {
    id: "swapSweep",
    label: "Swap sweep",
    help: "You pick one card to cut and a bunch of cards to try instead (same swap size every time). Scores your current list plus one test list per candidate, with play rate and other stats to help you pick winners.",
  },
  {
    id: "multiDeck",
    label: "Multi-deck",
    help: "Score a fixed set of decklists with the same hands-per-list settings. Queue lists from a previous run with Re-test selected, then run again to compare fresh samples side by side.",
  },
];

type RatioStrategyTabsProps = Readonly<{
  strategy: RatioStrategy;
  onStrategyChange: (value: RatioStrategy) => void;
}>;

export function RatioStrategyTabs({
  strategy,
  onStrategyChange,
}: RatioStrategyTabsProps) {
  const active =
    RATIO_STRATEGIES.find((entry) => entry.id === strategy) ??
    RATIO_STRATEGIES[0]!;

  return (
    <div className="mb-[22px] flex flex-wrap items-center gap-2.5">
      <div
        className={pillTabListClass}
        role="tablist"
        aria-label="Ratio lab search strategy"
      >
        {RATIO_STRATEGIES.map((entry) => {
          const isActive = strategy === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={pillTabVariants({ active: isActive })}
              onClick={() => onStrategyChange(entry.id)}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      <InfoPopover hideLabel label={active.label}>
        <div className="grid gap-2.5">
          {RATIO_STRATEGIES.map((entry) => (
            <p key={entry.id} className="m-0 leading-snug">
              <strong className="font-semibold">{entry.label}.</strong> {entry.help}
            </p>
          ))}
        </div>
      </InfoPopover>
    </div>
  );
}
