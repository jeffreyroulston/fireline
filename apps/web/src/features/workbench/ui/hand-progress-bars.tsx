"use client";

import type { HandProgress } from "@/lib/runs/types";

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
  if (hand.phase === "throttled") {
    return (
      <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
          #{hand.sampleIndex + 1}
        </span>
        <span className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
          waiting for memory
        </span>
      </div>
    );
  }
  const percent = handBarPercent(hand);
  return (
    <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2">
      <span className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
        #{hand.sampleIndex + 1}
      </span>
      <div className="h-1 w-full overflow-hidden bg-border">
        <span
          className="block h-full bg-accent transition-[width] duration-[180ms] ease-in-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase tabular-nums">
        {hand.rolloutsDone}/{hand.totalRollouts}
      </span>
    </div>
  );
}

export function HandProgressBars({
  hands,
}: {
  hands: HandProgress[] | undefined;
}) {
  const active = (hands ?? []).filter(
    (hand) =>
      hand.phase === "throttled" ||
      (hand.totalRollouts > 1 && hand.rolloutsDone > 0),
  );
  if (active.length === 0) {
    return null;
  }
  const visible = active.slice(0, MAX_VISIBLE_HANDS);
  const overflow = active.length - visible.length;
  const calculating = active.filter((hand) => hand.phase !== "throttled").length;
  const waiting = active.length - calculating;

  let label = `${active.length} hand${active.length === 1 ? "" : "s"} calculating`;
  if (waiting > 0 && calculating === 0) {
    label = `${waiting} hand${waiting === 1 ? "" : "s"} waiting for memory`;
  } else if (waiting > 0) {
    label = `${calculating} calculating · ${waiting} waiting`;
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
        {label}
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
