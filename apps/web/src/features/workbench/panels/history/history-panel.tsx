"use client";

import { type DeckCounts } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import {
  buildBarHighlights,
  CardLeaderboardPanel,
} from "../card-leaderboard";
import { PooledDamagePanel } from "../pooled-damage";
import { limitRecentPooledBars } from "../pooled-damage-bars";
import { RatioHistoryPanel } from "../ratio-history";
import { PanelTopline } from "../../ui";
import { historyQueryPatch } from "../../routes";
import { useHistoryPanel } from "../../hooks/use-history-panel";
import { HistoryComparePanel } from "./history-compare-panel";
import { HistoryControls } from "./history-controls";
import { HistoryRunTable } from "./history-run-table";
import {
  errorBannerClass,
  historyAnalysisClass,
  historyModeClass,
  historyPooledHeadingMetaClass,
  historySecondaryActionClass,
  poolLegendLabel,
  sampleBarsFromPooled,
  simHintClass,
} from "./shared";

type HistoryPanelProps = Readonly<{
  decks: SavedDeck[];
  routeDeckId?: string;
  refreshToken: number;
  onSwitchDeck: (deckId: string) => void;
  onSaveDecklist?: (
    counts: DeckCounts,
    score: number,
    rank: number,
    deckName: string,
  ) => void | Promise<void>;
  onOpenRatioRun: (runId: string, deckId: string) => void;
}>;

export function HistoryPanel({
  decks,
  routeDeckId,
  refreshToken,
  onSwitchDeck,
  onSaveDecklist,
  onOpenRatioRun,
}: HistoryPanelProps) {
  const panel = useHistoryPanel({ decks, routeDeckId, refreshToken });
  const {
    replaceQuery,
    filterDeckId,
    setFilterDeckId,
    runs,
    allRuns,
    groups,
    simType,
    setSimType,
    runSettings,
    availableRunSettings,
    updateRunSettings,
    selectedGroupKey,
    setSelectedGroupKey,
    pooled,
    selectedLeaderboardCard,
    setSelectedLeaderboardCard,
    error,
    loading,
    deletingId,
    dataEpoch,
    compareOpen,
    compareDeckId,
    setCompareDeckId,
    compareSimType,
    setCompareSimType,
    compareGroupKey,
    setCompareGroupKey,
    compareGroups,
    comparePooled,
    compareLoading,
    compareError,
    appliedRange,
    setAppliedRange,
    filteredLeaderboard,
    filterLoading,
    selectedDeck,
    selectedGroup,
    compareDeck,
    compareGroup,
    comparing,
    activeLeaderboard,
    sampleHighlights,
    handleDeleteRun,
    openCompare,
    clearCompare,
  } = panel;

  const { bars: sampleBars, total: sampleBarTotal } = (() => {
    const allBars = sampleBarsFromPooled(pooled);
    const total = pooled?.distribution?.totalSamples ?? allBars.length;
    return { ...limitRecentPooledBars(allBars), total };
  })();

  const baselineDist = pooled?.distribution ?? null;
  const compareDist = comparePooled?.distribution ?? null;

  const sameDeckName =
    !!selectedDeck && !!compareDeck && selectedDeck.name === compareDeck.name;
  const sameSim = simType === compareSimType;
  const showSimInLegend = comparing && !sameSim;
  const showVersionInLegend =
    comparing && (sameDeckName || sameSim) && !!selectedGroup && !!compareGroup;

  const baselineLegend = selectedDeck
    ? poolLegendLabel(
        selectedDeck.name,
        simType,
        selectedGroup,
        showSimInLegend || (comparing && sameDeckName && sameSim),
        showVersionInLegend,
      )
    : "Baseline";
  const compareLegend = compareDeck
    ? poolLegendLabel(
        compareDeck.name,
        compareSimType,
        compareGroup,
        showSimInLegend || (comparing && sameDeckName && sameSim),
        showVersionInLegend,
      )
    : "Compare";

  const barCardHighlights = buildBarHighlights(
    sampleHighlights?.samples ?? [],
    selectedLeaderboardCard,
  );

  const pooledSampleKey = pooled
    ? `${selectedDeck?.deckHash ?? ""}:${simType}:${selectedGroupKey}:${pooled.runCount}`
    : "";

  return (
    <div className={historyModeClass}>
      <PanelTopline kicker="CROSS-RUN ANALYSIS">
        Review completed sims, then pool damage and card rates only within one
        engine version. Simulation types stay on separate charts. Filter runs by
        turn order and horizon, then filter the bars and card board by damage.
        Pooled mean, P10, P50, P90, and ending influence stay on the full set.
      </PanelTopline>

      <HistoryControls
        decks={decks}
        filterDeckId={filterDeckId}
        simType={simType}
        selectedDeck={selectedDeck}
        groups={groups}
        selectedGroupKey={selectedGroupKey}
        runSettings={runSettings}
        availableRunSettings={availableRunSettings}
        onFilterDeckChange={(deckId) => {
          setFilterDeckId(deckId);
          if (deckId) {
            onSwitchDeck(deckId);
          }
        }}
        onSimTypeChange={(value) => {
          setSimType(value);
          replaceQuery((current) => historyQueryPatch(current, { sim: value }));
        }}
        onGroupKeyChange={(value) => {
          setSelectedGroupKey(value);
          replaceQuery((current) => historyQueryPatch(current, { vg: value }));
        }}
        onRunSettingsChange={updateRunSettings}
      />

      {!selectedDeck && (
        <p className={simHintClass}>
          Run history can show every deck. Pooled damage and card rates need a
          single deck so lists are not mixed.
        </p>
      )}

      <HistoryRunTable
        runs={runs}
        decks={decks}
        filterDeckId={filterDeckId}
        selectedDeck={selectedDeck}
        deletingId={deletingId}
        onDeleteRun={(runId) => void handleDeleteRun(runId)}
      />

      {loading && <p className={simHintClass}>Loading pooled analysis…</p>}

      {pooled?.distribution && baselineDist && (
        <div className={historyAnalysisClass}>
          <PooledDamagePanel
            meta={
              <div className={historyPooledHeadingMetaClass}>
                <strong>
                  {comparing && compareDist
                    ? `${pooled.runCount} vs ${comparePooled?.runCount ?? 0} runs · ${baselineDist.totalSamples} vs ${compareDist.totalSamples} samples`
                    : `${pooled.runCount} runs · ${baselineDist.totalSamples} samples`}
                </strong>
                {compareOpen ? (
                  <button
                    type="button"
                    className={historySecondaryActionClass}
                    onClick={clearCompare}
                  >
                    Clear compare
                  </button>
                ) : (
                  <button
                    type="button"
                    className={historySecondaryActionClass}
                    onClick={openCompare}
                  >
                    Compare
                  </button>
                )}
              </div>
            }
            distribution={baselineDist}
            compareDistribution={comparing ? compareDist : null}
            baselineLegend={baselineLegend}
            compareLegend={compareLegend}
            bars={sampleBars}
            totalSampleBars={sampleBarTotal}
            simType={simType}
            cardHighlights={barCardHighlights}
            highlightCardId={selectedLeaderboardCard}
            resetKey={pooledSampleKey}
            onAppliedRangeChange={setAppliedRange}
          >
            {compareOpen && (
              <HistoryComparePanel
                decks={decks}
                compareDeckId={compareDeckId}
                compareSimType={compareSimType}
                compareGroupKey={compareGroupKey}
                compareGroups={compareGroups}
                compareLoading={compareLoading}
                compareError={compareError}
                onCompareDeckChange={setCompareDeckId}
                onCompareSimTypeChange={setCompareSimType}
                onCompareGroupKeyChange={setCompareGroupKey}
              />
            )}
          </PooledDamagePanel>

          {filterLoading && appliedRange && !filteredLeaderboard && (
            <p className={simHintClass}>Updating card board…</p>
          )}
          {activeLeaderboard &&
            (activeLeaderboard.cards.length > 0 || appliedRange) && (
              <CardLeaderboardPanel
                leaderboard={activeLeaderboard}
                selectedCardId={selectedLeaderboardCard}
                onSelectedCardIdChange={(cardId) => {
                  setSelectedLeaderboardCard(cardId);
                  replaceQuery((current) =>
                    historyQueryPatch(current, {
                      card: cardId,
                      ...(selectedGroupKey && !current.get("vg")
                        ? { vg: selectedGroupKey }
                        : {}),
                    }),
                  );
                }}
              />
            )}
        </div>
      )}

      {selectedDeck && (
        <RatioHistoryPanel
          deck={selectedDeck}
          runs={allRuns}
          refreshToken={dataEpoch}
          onSaveDecklist={onSaveDecklist}
          onOpenRun={onOpenRatioRun}
        />
      )}

      {error && (
        <p className={errorBannerClass} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
