"use client";

import type {
  PlaytestAction,
  PlaytestActionOption,
  PlaytestGlimpseLayout,
} from "@ga-fire/contracts";
import { CARDS, type CardId } from "@/lib/engine";
import { cn, buttonVariants } from "@/lib/utils";
import { SectionHeading, HandCard } from "../../ui";

function cardShort(id: string): string {
  const card = CARDS[id as CardId];
  return card?.short ?? card?.name ?? id;
}

export function formatGlimpseLayoutLabel(peek: string[], layout: number): string {
  if (peek.length === 0) {
    return `Layout ${layout}`;
  }
  if (peek.length === 1) {
    const name = cardShort(peek[0]);
    return layout === 1 ? `${name} to bottom` : `${name} to top`;
  }
  const first = cardShort(peek[0]);
  const second = cardShort(peek[1]);
  switch (layout) {
    case 0:
      return `${first} to top, ${second} to top`;
    case 1:
      return `${second} to top, ${first} to top`;
    case 2:
      return `${first} to top, ${second} to bottom`;
    case 3:
      return `${second} to top, ${first} to bottom`;
    case 4:
      return "Both to bottom";
    default:
      return `Layout ${layout}`;
  }
}

function sortGlimpseLayouts(
  layouts: PlaytestGlimpseLayout[],
  peekLength: number,
): PlaytestGlimpseLayout[] {
  if (peekLength < 2) {
    return layouts;
  }
  return [...layouts].sort((left, right) => {
    if (left.layout === 4) {
      return 1;
    }
    if (right.layout === 4) {
      return -1;
    }
    return left.layout - right.layout;
  });
}

function glimpseLayoutIndex(action: PlaytestAction): number | null | undefined {
  if (action.op !== "materializeZanderMemory") {
    return undefined;
  }
  const raw = action as PlaytestAction & {
    glimpseLayout?: number | null;
    glimpse_layout?: number | null;
  };
  return raw.glimpseLayout ?? raw.glimpse_layout;
}

export function findGlimpseAction(
  legalActions: PlaytestActionOption[],
  layout: number,
): PlaytestActionOption | undefined {
  return legalActions.find((option) => glimpseLayoutIndex(option.action) === layout);
}

export function partitionLegalActions(legalActions: PlaytestActionOption[]) {
  const glimpse: PlaytestActionOption[] = [];
  const other: PlaytestActionOption[] = [];
  for (const option of legalActions) {
    const layout = glimpseLayoutIndex(option.action);
    if (layout != null) {
      glimpse.push(option);
    } else {
      other.push(option);
    }
  }
  return { glimpse, other };
}

export const GLIMPSE_ZANDER_LABEL = "Materialize Zander";

export function hasGlimpseChoice(legalActions: PlaytestActionOption[]): boolean {
  return partitionLegalActions(legalActions).glimpse.length > 0;
}

export function GlimpsePicker({
  peek,
  layouts,
  legalActions,
  busy,
  onApply,
  onCancel,
}: {
  peek: string[];
  layouts: PlaytestGlimpseLayout[];
  legalActions: PlaytestActionOption[];
  busy: boolean;
  onApply: (action: PlaytestAction) => void;
  onCancel: () => void;
}) {
  const visiblePeek = peek.slice(0, 2);
  const relevantLayouts = sortGlimpseLayouts(
    layouts.filter(
      (layout) => findGlimpseAction(legalActions, layout.layout) != null,
    ),
    visiblePeek.length,
  );
  if (visiblePeek.length === 0 || relevantLayouts.length === 0) {
    return null;
  }

  return (
    <div className="border border-border bg-surface-muted px-3 py-3">
      <SectionHeading
        className="mb-2"
        title="GLIMPSE"
        meta={<strong>{visiblePeek.length} cards</strong>}
      />
      <p className="mt-0 mb-2 font-mono text-[11px] tracking-[0.06em] text-muted">
        Top of the draw queue before Zander reorders it.
      </p>
      <div className="mb-3 flex flex-wrap gap-3">
        {visiblePeek.map((id, index) => (
          <div key={`glimpse-${id}-${index}`} className="w-28">
            <HandCard id={id as CardId} />
          </div>
        ))}
      </div>
      <p className="mt-0 mb-2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
        Choose deck order
      </p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {relevantLayouts.map((layout) => {
          const option = findGlimpseAction(legalActions, layout.layout);
          const label = formatGlimpseLayoutLabel(visiblePeek, layout.layout);
          return (
            <li key={layout.layout}>
              <button
                type="button"
                className={cn(
                  buttonVariants({ intent: "secondary" }),
                  "h-auto min-h-[44px] w-full justify-start whitespace-normal px-3 py-2 text-left text-[13px] normal-case tracking-normal",
                )}
                onClick={() => option && onApply(option.action)}
                disabled={busy || !option}
                title={label}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={cn(buttonVariants({ intent: "secondary" }), "mt-3 min-h-[38px]")}
        onClick={onCancel}
        disabled={busy}
      >
        Cancel
      </button>
    </div>
  );
}
