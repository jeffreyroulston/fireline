"use client";

import type { DeckCounts, SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { isUnsuccessfulTerminalStatus } from "@/lib/runs/types";
import { cn } from "@/lib/utils/cn";
import { errorBannerClass } from "@/lib/utils/ui-classes";
import { ActionBar, PanelTopline, RunSettings } from "../ui";
import {
  CutBudgetPanel,
  MultiDeckPanel,
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
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  cpuCount: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  seed: number;
  optimizeRun: UseShellSolverResult["optimizeRun"];
  optimizeBusy: boolean;
  decksLoading: boolean;
  onSwitchDeck: (deckId: string) => void;
  onGoFirstChange: (goFirst: boolean) => void;
  onTurnsChange: (turns: number) => void;
  onSimTypeChange: (simType: SimType) => void;
  onRolloutsChange: (rollouts: number) => void;
  onMaxThreadsChange: (value: number | null) => void;
  onGlimpseEnabledChange: (value: boolean) => void;
  onMaxHandDurationSecsChange: (value: number | null) => void;
  onMaxCardDrawChange: (value: number | null) => void;
  onSeedChange: (value: number) => void;
  onOptimize: () => void;
  onCancelOptimize: () => void;
  onSaveOptimize?: () => void;
  onSaveDecklist: (
    counts: DeckCounts,
    score: number,
    rank: number,
    deckName?: string,
  ) => void;
  onRetestSelected?: (decks: DeckCounts[]) => void;
}>;

export function RatiosTab({
  decks,
  activeDeck,
  ratio,
  goFirst,
  turns,
  simType,
  rollouts,
  cpuCount,
  maxThreads,
  glimpseEnabled,
  maxHandDurationSecs,
  maxCardDraw,
  seed,
  optimizeRun,
  optimizeBusy,
  decksLoading,
  onSwitchDeck,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onMaxThreadsChange,
  onGlimpseEnabledChange,
  onMaxHandDurationSecsChange,
  onMaxCardDrawChange,
  onSeedChange,
  onOptimize,
  onCancelOptimize,
  onSaveOptimize,
  onSaveDecklist,
  onRetestSelected,
}: RatiosTabProps) {
  const optimizeFailed =
    Boolean(optimizeRun) &&
    isUnsuccessfulTerminalStatus(optimizeRun?.status ?? "");
  const ratioResult =
    optimizeFailed || optimizeBusy ? null : (optimizeRun?.ratioResult ?? null);

  const usesTableResults =
    ratio.ratioStrategy === "swapSweep" ||
    ratio.ratioStrategy === "multiDeck" ||
    ratioResult?.strategy === "multiDeck";

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
      ) : ratio.ratioStrategy === "multiDeck" ? (
        <MultiDeckPanel
          decks={ratio.multiDeckLists}
          deckSize={ratio.deckSize}
          baseCounts={ratio.ratioBaseCounts}
          baseDeckName={activeDeck?.name}
          onAdd={ratio.appendMultiDeckList}
          onRemove={ratio.removeMultiDeckList}
          onClear={ratio.clearMultiDeckLists}
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
            attemptCeiling={ratio.attemptCeiling}
            coveragePercent={ratio.coveragePercent}
          />
        </>
      )}
      <RatioControls
        ratioSamples={ratio.ratioSamples}
        metric={ratio.metric}
        evalMode={ratio.ratioEvalMode}
        strategy={ratio.ratioStrategy}
        onRatioSamplesChange={ratio.setRatioSamples}
        onMetricChange={ratio.setMetric}
        onEvalModeChange={ratio.setRatioEvalMode}
      />
      <RunSettings
        goFirst={goFirst}
        turns={turns}
        simType={simType}
        rollouts={rollouts}
        seed={seed}
        cpuCount={cpuCount}
        maxThreads={maxThreads}
        glimpseEnabled={glimpseEnabled}
        maxHandDurationSecs={maxHandDurationSecs}
        maxCardDraw={maxCardDraw}
        onFirstChange={onGoFirstChange}
        onTurnsChange={onTurnsChange}
        onSimTypeChange={onSimTypeChange}
        onRolloutsChange={onRolloutsChange}
        onMaxThreadsChange={onMaxThreadsChange}
        onGlimpseEnabledChange={onGlimpseEnabledChange}
        onMaxHandDurationSecsChange={onMaxHandDurationSecsChange}
        onMaxCardDrawChange={onMaxCardDrawChange}
        onSeedChange={onSeedChange}
      />
      <ActionBar
        label={
          ratio.ratioStrategy === "swapSweep"
            ? "Run swap sweep"
            : ratio.ratioStrategy === "multiDeck"
              ? "Run multi-deck test"
              : "Sample ratio space"
        }
        busy={optimizeBusy}
        onRun={onOptimize}
        onCancel={onCancelOptimize}
        onSave={onSaveOptimize}
        progress={optimizeRun?.progress ?? null}
        monteCarloRollouts={simType === "monte_carlo" ? rollouts : undefined}
      />
      {optimizeFailed && !optimizeBusy ? (
        <p className={cn(errorBannerClass, "mt-[30px]")} role="alert">
          {optimizeRun?.error?.trim() || "Ratio lab run failed."}
        </p>
      ) : usesTableResults && ratioResult ? (
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
          onRetestSelected={onRetestSelected}
          retestBusy={optimizeBusy}
        />
      )}
    </div>
  );
}
