"use client";

import { useState } from "react";
import Link from "next/link";
import type { DeckCounts } from "@/lib/engine";
import { formatDecklist } from "@/lib/engine";
import { pillTabListClass, pillTabVariants } from "@/lib/utils";
import { RatioResults } from "./results";
import { SwapSweepResults } from "./swap-sweep-results";
import {
  PROTOTYPE_CRITERIA,
  PROTOTYPE_RANKING,
  PROTOTYPE_SAMPLES,
  PROTOTYPE_SWAP_SWEEP,
} from "./prototype-fixtures";

type FixtureView = "ranking" | "swapSweep";

export function RatioPrototypePage() {
  const [view, setView] = useState<FixtureView>("ranking");
  const [lastSave, setLastSave] = useState<string | null>(null);

  function handleSave(
    counts: DeckCounts,
    score: number,
    rank: number,
  ) {
    const label = rank === 0 ? "Baseline" : `#${rank}`;
    setLastSave(
      `${label} · ${score.toFixed(2)}\n${formatDecklist(counts)}`,
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1440px] px-[clamp(18px,4vw,62px)] pb-7 max-[620px]:px-3.5">
      <header className="flex min-h-[84px] items-center justify-between border-b border-border">
        <div>
          <p className="m-0 font-mono text-[10px] tracking-[0.13em] text-muted uppercase">
            Fixture data · not a live run
          </p>
          <h1 className="m-0 font-display text-[30px] leading-[0.9] tracking-[0.06em]">
            RATIO RESULTS PROTOTYPE
          </h1>
        </div>
        <Link
          href="/ratios"
          className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase no-underline hover:text-foreground"
        >
          Back to ratio lab
        </Link>
      </header>

      <div className="mt-7 grid gap-5">
        <p className="m-0 max-w-[52ch] text-sm leading-[1.6] text-muted">
          Edit{" "}
          <code className="font-mono text-[12px] text-foreground">
            prototype-fixtures.ts
          </code>{" "}
          and refresh. Ranking and swap sweep both use the real result
          panels, including candidate detail and the card leaderboard.
        </p>

        <div className={pillTabListClass} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === "ranking"}
            className={pillTabVariants({ active: view === "ranking" })}
            onClick={() => setView("ranking")}
          >
            Sample ranking
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "swapSweep"}
            className={pillTabVariants({ active: view === "swapSweep" })}
            onClick={() => setView("swapSweep")}
          >
            Swap sweep
          </button>
        </div>

        {lastSave && (
          <pre className="m-0 overflow-x-auto border border-border bg-surface p-3.5 font-mono text-[11px] leading-[1.5] text-foreground whitespace-pre-wrap">
            Saved locally (not written to the database)
            {"\n"}
            {lastSave}
          </pre>
        )}
      </div>

      {view === "ranking" ? (
        <RatioResults
          result={PROTOTYPE_RANKING}
          criteria={PROTOTYPE_CRITERIA}
          samples={PROTOTYPE_SAMPLES}
          onSaveDecklist={handleSave}
        />
      ) : (
        <SwapSweepResults
          result={PROTOTYPE_SWAP_SWEEP}
          samples={PROTOTYPE_SAMPLES}
          onSaveDecklist={handleSave}
        />
      )}
    </main>
  );
}
