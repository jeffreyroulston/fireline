"use client";

import type { HandProgress } from "@/lib/runs/types";
import { cn } from "@/lib/utils/cn";

const MAX_VISIBLE_HANDS = 8;

function handBarPercent(hand: HandProgress): number {
  if (hand.totalRollouts <= 1) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(100, Math.round((hand.rolloutsDone / hand.totalRollouts) * 100)),
  );
}

function HandBar({ hand }: { hand: HandProgress }) {
  const percent = handBarPercent(hand);
  const indeterminate = hand.totalRollouts <= 1 || hand.phase === "started";
  return (
    <div className="grid min-w-0 grid-cols-[2.5rem_1fr] items-center gap-2">
      <span className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
        #{hand.sampleIndex}
      </span>
      <div className="h-1 w-full overflow-hidden bg-border">
        <span
          className={cn(
            "block h-full bg-accent transition-[width] duration-[180ms] ease-in-out",
            indeterminate &&
              "w-[28%] animate-[progress-indeterminate_1.15s_ease-in-out_infinite] [transform:translateX(-120%)]",
          )}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function HandProgressBars({
  hands,
}: {
  hands: HandProgress[] | undefined;
}) {
  if (!hands || hands.length === 0) {
    return null;
  }
  const visible = hands.slice(0, MAX_VISIBLE_HANDS);
  const overflow = hands.length - visible.length;

  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
        {hands.length} concurrent hand{hands.length === 1 ? "" : "s"}
      </div>
      <div className="grid min-w-0 gap-1">
        {visible.map((hand) => (
          <HandBar key={hand.sampleIndex} hand={hand} />
        ))}
      </div>
      {overflow > 0 && (
        <div className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
          +{overflow} more hand{overflow === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
