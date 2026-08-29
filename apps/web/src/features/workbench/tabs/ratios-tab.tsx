"use client";

import type { DeckCounts } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { isUnsuccessfulTerminalStatus } from "@/lib/runs/types";
import { cn } from "@/lib/utils/cn";
import { errorBannerClass } from "@/lib/utils/ui-classes";
import { ActionBar, PanelTopline } from "../ui";
import {
  CutBudgetPanel,
  PermutationPanel,
  RatioControls,
  RatioDeckPicker,
  RatioResults,
  RatioStrategyTabs,
  ReplacementPoolPanel,
  SwapSweepPanel,
  SwapSweepResults,
} from "../panels/ratios";
import type { UseRatioStateResult } from "../hooks/use-ratio-state";
import type { UseShellSolverResult } from "../hooks/use-shell-solver";

type RatiosTabProps = Readonly<{
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  ratio: UseRatioStateResult;
  optimizeRun: UseShellSolverResult["optimizeRun"];
  optimizeBusy: boolean;
  decksLoading: boolean;
  onSwitchDeck: (deckId: string) => void;
  onOptimize: () => void;
  onCancelOptimize: () => void;
  onSaveDecklist: (
    counts: DeckCounts,
    score: number,
    rank: number,
    deckName?: string,
  ) => void;
}>;

export function RatiosTab({
  decks,
  activeDeck,
  ratio,
  optimizeRun,
  optimizeBusy,
  decksLoading,
  onSwitchDeck,
  onOptimize,
  onCancelOptimize,
  onSaveDecklist,
}: RatiosTabProps) {
  const optimizeFailed =
    Boolean(optimizeRun) &&
    isUnsuccessfulTerminalStatus(optimizeRun?.status ?? "");
  const ratioResult =
    optimizeFailed || optimizeBusy ? null : (optimizeRun?.ratioResult ?? null);

  return (
    <div className="grid w-full">
      <PanelTopline kicker="DECK REFINEMENT">
        Start from a saved list, open cut budgets on cards you may trim, pick a
        global replacement pool for the freed slots, then sample unique legal
        lists by opening-hand damage.
      </PanelTopline>
      <RatioStrategyTabs
        strategy={ratio.ratioStrategy}
        onStrategyChange={ratio.setRatioStrategy}
      />
      <RatioDeckPicker
        decks={decks}
        activeDeck={activeDeck}
        recognizedCount={ratio.ratioRecognizedCount}
        onSwitchDeck={onSwitchDeck}
        decksLoading={decksLoading}
      />
      {ratio.ratioStrategy === "swapSweep" ? (
        <SwapSweepPanel
          baseCounts={ratio.ratioBaseCounts}
          swapFrom={ratio.swapFrom}
          swapCount={ratio.swapCount}
          candidates={ratio.swapCandidates}
          onSwapFromChange={ratio.setSwapFrom}
          onSwapCountChange={ratio.setSwapCount}
          onToggleCandidate={ratio.toggleSwapCandidate}
        />
      ) : (
        <>
          <CutBudgetPanel
            baseCounts={ratio.ratioBaseCounts}
            cutBudgets={ratio.cutBudgets}
            onCutBudgetChange={ratio.setCutBudget}
          />
          <ReplacementPoolPanel
            baseCounts={ratio.ratioBaseCounts}
            replacements={ratio.replacements}
            onToggle={ratio.toggleReplacement}
            onMaxChange={ratio.setReplacementMax}
          />
          <PermutationPanel
            legalDecklists={ratio.legalDecklists}
            boundMinTotal={ratio.boundMinTotal}
            boundMaxTotal={ratio.boundMaxTotal}
            deckSize={ratio.deckSize}
            freeCopies={ratio.freeCopies}
            deckAttempts={ratio.deckAttempts}
            attemptCeiling={ratio.attemptCeiling}
            coveragePercent={ratio.coveragePercent}
            busy={optimizeBusy}
            progress={optimizeRun?.progress ?? null}
            onDeckAttemptsChange={ratio.setDeckAttempts}
          />
        </>
      )}
      <RatioControls
        ratioSamples={ratio.ratioSamples}
        metric={ratio.metric}
        onRatioSamplesChange={ratio.setRatioSamples}
        onMetricChange={ratio.setMetric}
      />
      <ActionBar
        label={
          ratio.ratioStrategy === "swapSweep"
            ? "Run swap sweep"
            : "Sample ratio space"
        }
        busy={optimizeBusy}
        onRun={onOptimize}
        onCancel={onCancelOptimize}
        progress={
          ratio.ratioStrategy === "swapSweep"
            ? (optimizeRun?.progress ?? null)
            : null
        }
      />
      {optimizeFailed && !optimizeBusy ? (
        <p className={cn(errorBannerClass, "mt-[30px]")} role="alert">
          {optimizeRun?.error?.trim() || "Ratio lab run failed."}
        </p>
      ) : ratio.ratioStrategy === "swapSweep" && ratioResult ? (
        <SwapSweepResults
          result={ratioResult}
          samples={ratio.ratioSamples}
          onSaveDecklist={onSaveDecklist}
        />
      ) : (
        <RatioResults
          result={ratioResult}
          criteria={ratio.ratioCriteria}
          samples={ratio.ratioSamples}
          onSaveDecklist={onSaveDecklist}
        />
      )}
    </div>
  );
}
