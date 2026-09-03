"use client";

import { cardImageUrl } from "@/lib/card-images";
import { type CardId, type SimType } from "@/lib/engine";
import type {
  CardDatabaseSource,
  WorkerVersion,
} from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { errorBannerClass } from "@/lib/utils/ui-classes";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
} from "@/lib/utils/card-classes";
import { InfoPopover } from "@/components/info-popover";
import { SecondaryActionButton } from "@/components/secondary-action-button";
import { DataTable, PanelTopline, SectionHeading } from "../../ui";
import { SIM_TYPE_LABELS } from "../../types";
import { useCardDatabasePanel } from "../../hooks/use-card-database-panel";
import { CardDbFilters } from "./card-db-filters";
import { RunSettingsFilterBar } from "../../ui/run-settings-filter-bar";
import { CardDbDetailPanel } from "./card-db-detail-panel";
import { CardDbHeroStats } from "./card-db-hero-stats";
import { CardDbPartnerPeek } from "./card-db-partner-peek";
import { CardPartnersSection } from "./card-partners-section";
import { CatalogTile } from "./catalog-tile";
import { PerformanceBlock } from "./performance-block";
import { PlayTimingList } from "./play-timing-list";
import { CARD_DB_SOURCES } from "./constants";
import {
  formatDmg,
  formatLift,
} from "./formatters";
import {
  cardDbDetailBarClass,
  cardDbDetailClass,
  cardDbDetailFiltersClass,
  cardDbDetailHeroArtClass,
  cardDbDetailHeroArtFallbackClass,
  cardDbDetailHeroArtImageClass,
  cardDbDetailHeroBodyClass,
  cardDbDetailHeroClass,
  cardDbDetailHeroInfoClass,
  cardDbDetailHeroPanelClass,
  cardDbDetailTitleClass,
  cardDbEmptyClass,
  cardDbGridClass,
  cardDbGridPaneClass,
  cardDbHeroShortClass,
  cardDbPanelClass,
  formatGroup,
  groupKey,
  partnerDeltaClass,
} from "./shared";

export interface CardDatabasePanelProps {
  readonly workerVersion: WorkerVersion | null;
}

export function CardDatabasePanel({ workerVersion }: CardDatabasePanelProps) {
  const panel = useCardDatabasePanel({ workerVersion });

  const {
    dbSource,
    simType,
    search,
    setSearch,
    kindFilter,
    contributors,
    cards,
    totalRuns,
    totalSamples,
    loading,
    error,
    versionGroups,
    groupsLoading,
    currentEngine,
    detailGroupKey,
    setDetailGroupKey,
    detailPerformance,
    detailDecks,
    detailPlayMatrix,
    detailPairings,
    partnerMode,
    partnerSort,
    setPartnerSort,
    detailError,
    selectedCard,
    mainCards,
    materialCards,
    ownershipSummary,
    validatedDeckId,
    runSettings,
    availableRunSettings,
    updateDbSource,
    selectCard,
    updateSimType,
    updateKindFilter,
    updateDeckFilter,
    updateRunSettings,
    handlePartnerModeChange,
  } = panel;

  return (
    <div className={cardDbPanelClass}>
      <PanelTopline kicker="CARD DATABASE">
        Browse catalog performance across saved-deck evaluations. Grid chips
        show opening-hand lift vs the same deck without the card; open a card
        for detail and older versions.
      </PanelTopline>

      {!selectedCard && (
        <CardDbFilters
          dbSource={dbSource}
          simType={simType}
          search={search}
          kindFilter={kindFilter}
          selectedDeckId={validatedDeckId}
          contributors={contributors}
          ownershipSummary={ownershipSummary}
          totalRuns={totalRuns}
          totalSamples={totalSamples}
          runSettings={runSettings}
          availableRunSettings={availableRunSettings}
          onSearchChange={setSearch}
          onDbSourceChange={(source) => updateDbSource(source, true)}
          onSimTypeChange={(value) => updateSimType(value, true)}
          onKindFilterChange={updateKindFilter}
          onDeckFilterChange={updateDeckFilter}
          onRunSettingsChange={updateRunSettings}
        />
      )}

      {!currentEngine && groupsLoading && (
        <p className={cardDbEmptyClass}>Loading version data…</p>
      )}
      {!currentEngine && !groupsLoading && (
        <p className={cardDbEmptyClass}>
          No data for this simulation yet.
        </p>
      )}
      {error && (
        <p className={errorBannerClass} role="alert">
          {error}
        </p>
      )}
      {loading && !selectedCard && (
        <p className={cardDbEmptyClass}>Loading performance…</p>
      )}

      {selectedCard ? (
        <section className={cardDbDetailClass} aria-live="polite">
          <div className={cardDbDetailBarClass}>
            <SecondaryActionButton
              className="w-auto shrink-0"
              onClick={() => selectCard(null)}
            >
              ← Back to catalog
            </SecondaryActionButton>
            <div className={cardDbDetailFiltersClass}>
              <label className="field">
                <span>Strategy</span>
                <select
                  value={dbSource}
                  onChange={(event) => {
                    updateDbSource(event.target.value as CardDatabaseSource);
                  }}
                >
                  {CARD_DB_SOURCES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Simulation</span>
                <select
                  value={simType}
                  onChange={(event) => {
                    updateSimType(event.target.value as SimType);
                  }}
                >
                  {(Object.keys(SIM_TYPE_LABELS) as SimType[]).map((id) => (
                    <option key={id} value={id}>
                      {SIM_TYPE_LABELS[id]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Version</span>
                <select
                  value={detailGroupKey}
                  onChange={(event) => setDetailGroupKey(event.target.value)}
                >
                  {currentEngine && (
                    <option
                      value={`${currentEngine.rulesVersion}:${currentEngine.samplerVersion}:${currentEngine.attributionVersion}`}
                    >
                      {panel.workerVersion ? "Current engine" : "Latest data"}{" "}
                      · r{currentEngine.rulesVersion} · s
                      {currentEngine.samplerVersion} · a
                      {currentEngine.attributionVersion}
                    </option>
                  )}
                  {versionGroups
                    .filter((group) => {
                      if (!currentEngine) return true;
                      return (
                        groupKey(group) !==
                        `${currentEngine.rulesVersion}:${currentEngine.samplerVersion}:${currentEngine.attributionVersion}`
                      );
                    })
                    .map((group) => (
                      <option key={groupKey(group)} value={groupKey(group)}>
                        {formatGroup(group)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Deck</span>
                <select
                  value={validatedDeckId ?? ""}
                  disabled={contributors.length === 0}
                  onChange={(event) =>
                    updateDeckFilter(event.target.value || null)
                  }
                >
                  <option value="">All decks</option>
                  {contributors.map((deck) => (
                    <option key={deck.deckId} value={deck.deckId}>
                      {deck.name} · {deck.samples.toLocaleString()} samples
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <RunSettingsFilterBar
              value={runSettings}
              available={availableRunSettings}
              onChange={updateRunSettings}
            />
          </div>

          <CardDbDetailPanel className={cardDbDetailHeroPanelClass}>
            <div
              className={cardDbDetailHeroClass(
                selectedCard.kind !== "material",
              )}
            >
              <div className={cardDbDetailHeroInfoClass}>
                <div className={cardDbDetailHeroArtClass}>
                  {cardImageUrl(selectedCard.id as CardId) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={cardDbDetailHeroArtImageClass}
                      src={cardImageUrl(selectedCard.id as CardId)!}
                      alt={selectedCard.name}
                    />
                  ) : (
                    <div
                      className={cn(
                        cardTileClass(selectedCard.element === "fire"),
                        cardDbDetailHeroArtFallbackClass,
                        "pointer-events-none min-h-0 p-[13px]",
                      )}
                    >
                      <span
                        className={cardTileAccentClassFor(
                          selectedCard.element === "fire",
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          cardTileLabelClass,
                          selectedCard.element === "fire" && "text-primary-dark",
                        )}
                      >
                        {selectedCard.element}
                      </span>
                      <b className={cardTileTitleClass}>{selectedCard.name}</b>
                      <small className={cardTileMetaClass}>
                        {selectedCard.cost} · {selectedCard.kind}
                      </small>
                    </div>
                  )}
                </div>
                <div className={cardDbDetailHeroBodyClass}>
                  <h2 className={cardDbDetailTitleClass}>{selectedCard.name}</h2>
                  {selectedCard.short &&
                  selectedCard.short !== selectedCard.name ? (
                    <p className={cardDbHeroShortClass}>{selectedCard.short}</p>
                  ) : null}
                  <CardDbHeroStats card={selectedCard} />
                </div>
              </div>
              {selectedCard.kind !== "material" ? (
                <CardDbPartnerPeek
                  pairings={detailPairings}
                  catalogCards={cards}
                  onSelectPartner={selectCard}
                />
              ) : null}
            </div>
          </CardDbDetailPanel>

          <CardDbDetailPanel
            title="PERFORMANCE"
            titleHelp="Mean total line damage per opening hand (weighted by hand frequency)."
          >
            <PerformanceBlock
              performance={detailPerformance}
              source={dbSource}
            />
          </CardDbDetailPanel>

          {selectedCard.kind !== "material" && (
            <CardDbDetailPanel
              title="CARD PARTNERS"
              titleHelp={
                <>
                  Mean opening-hand damage across{" "}
                  {detailPairings?.totalSamples.toLocaleString() ?? "—"} samples.
                </>
              }
            >
              <CardPartnersSection
                pairings={detailPairings}
                selectedName={selectedCard.name}
                mode={partnerMode}
                onModeChange={handlePartnerModeChange}
                sort={partnerSort}
                onSortChange={setPartnerSort}
              />
            </CardDbDetailPanel>
          )}

          <CardDbDetailPanel title="PLAY TIMING">
            {detailPlayMatrix ? (
              <PlayTimingList matrix={detailPlayMatrix} />
            ) : (
              <p className={cardDbEmptyClass}>No play timing for this version.</p>
            )}
          </CardDbDetailPanel>

          <CardDbDetailPanel title="IN DECKS">
            {detailError && (
              <p className={errorBannerClass} role="alert">
                {detailError}
              </p>
            )}
            {detailDecks.length === 0 ? (
              <p className={cardDbEmptyClass}>
                {selectedCard.kind === "material"
                  ? "No evaluate stats for this material in included decks."
                  : "Not present in any saved deck."}
              </p>
            ) : (
              <DataTable
                columns={[
                  {
                    id: "deck",
                    header: "Deck",
                    cell: (deck) => deck.name,
                  },
                  {
                    id: "copies",
                    header: "Copies",
                    metric: true,
                    cell: (deck) => (deck.copies != null ? deck.copies : "—"),
                  },
                  {
                    id: "withHand",
                    header: "In hand",
                    metric: true,
                    cell: (deck) =>
                      deck.withHandMean != null
                        ? formatDmg(deck.withHandMean)
                        : "—",
                  },
                  {
                    id: "withoutHand",
                    header: "Not in hand",
                    metric: true,
                    cell: (deck) =>
                      deck.withoutHandMean != null
                        ? formatDmg(deck.withoutHandMean)
                        : "—",
                  },
                  {
                    id: "handLift",
                    header: "Lift",
                    metric: true,
                    cell: (deck) =>
                      deck.handLift != null ? (
                        <span className={partnerDeltaClass(deck.handLift)}>
                          {formatLift(deck.handLift)}
                        </span>
                      ) : (
                        "—"
                      ),
                  },
                  {
                    id: "samples",
                    header: "Samples",
                    headerHelp: (
                      <InfoPopover hideLabel label="Samples">
                        Opening-hand sample counts: with this card in hand /
                        without.
                      </InfoPopover>
                    ),
                    metric: true,
                    cell: (deck) =>
                      deck.withHandSamples > 0 || deck.withoutHandSamples > 0
                        ? `${deck.withHandSamples} / ${deck.withoutHandSamples}`
                        : "—",
                  },
                ]}
                rows={detailDecks}
                rowKey={(deck) => deck.deckId}
              />
            )}
          </CardDbDetailPanel>
        </section>
      ) : (
        <div className={cardDbGridPaneClass}>
          <SectionHeading
            title="CATALOG"
            meta={`${mainCards.length} cards`}
          />
          <div className={cardDbGridClass}>
            {mainCards.map((card) => (
              <CatalogTile
                key={card.id}
                card={card}
                onSelect={() => selectCard(card.id)}
              />
            ))}
          </div>

          {materialCards.length > 0 && (
            <>
              <SectionHeading
                title="MATERIALS"
                meta={`${materialCards.length} cards`}
              />
              <div className={cardDbGridClass}>
                {materialCards.map((card) => (
                  <CatalogTile
                    key={card.id}
                    card={card}
                    onSelect={() => selectCard(card.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
