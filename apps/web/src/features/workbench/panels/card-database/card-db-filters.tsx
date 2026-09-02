"use client";

import { cn } from "@/lib/utils";
import type {
  CardDatabaseContributor,
  CardDatabaseSource,
} from "@/lib/api/client";
import type { SimType } from "@/lib/engine";
import { SIM_TYPE_LABELS } from "../../types";
import { RunSettingsFilterBar } from "../../ui/run-settings-filter-bar";
import type {
  AvailableRunSettings,
  RunSettingsFilterState,
} from "../../lib/run-settings-filter";
import { CARD_DB_SOURCES, KIND_FILTERS } from "./constants";
import { formatPct } from "./formatters";
import {
  cardDbContributorItemClass,
  cardDbContributorListClass,
  cardDbContributorMetaClass,
  cardDbContributorNameClass,
  cardDbEmptyClass,
  cardDbKindButtonClass,
  cardDbSearchClass,
  cardDbSourcesClass,
  cardDbSourcesSummaryClass,
  cardDbToolbarClass,
} from "./shared";

export interface CardDbFiltersProps {
  readonly dbSource: CardDatabaseSource;
  readonly simType: SimType;
  readonly search: string;
  readonly kindFilter: string | null;
  readonly selectedDeckId: string | null;
  readonly contributors: CardDatabaseContributor[];
  readonly ownershipSummary: string;
  readonly totalRuns: number;
  readonly totalSamples: number;
  readonly runSettings: RunSettingsFilterState;
  readonly availableRunSettings?: AvailableRunSettings;
  readonly onSearchChange: (value: string) => void;
  readonly onDbSourceChange: (source: CardDatabaseSource) => void;
  readonly onSimTypeChange: (simType: SimType) => void;
  readonly onKindFilterChange: (kind: string | null) => void;
  readonly onDeckFilterChange: (deckId: string | null) => void;
  readonly onRunSettingsChange: (next: RunSettingsFilterState) => void;
}

function DeckFilterSelect({
  value,
  disabled,
  contributors,
  onDeckFilterChange,
}: Readonly<{
  value: string;
  disabled: boolean;
  contributors: CardDatabaseContributor[];
  onDeckFilterChange: (deckId: string | null) => void;
}>) {
  return (
    <label className="field">
      <span>Deck</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onDeckFilterChange(event.target.value || null)}
      >
        <option value="">All decks</option>
        {contributors.map((deck) => (
          <option key={deck.deckId} value={deck.deckId}>
            {deck.name} · {deck.samples.toLocaleString()} samples
          </option>
        ))}
      </select>
    </label>
  );
}

export function CardDbFilters({
  dbSource,
  simType,
  search,
  kindFilter,
  selectedDeckId,
  contributors,
  ownershipSummary,
  totalRuns,
  totalSamples,
  runSettings,
  availableRunSettings,
  onSearchChange,
  onDbSourceChange,
  onSimTypeChange,
  onKindFilterChange,
  onDeckFilterChange,
  onRunSettingsChange,
}: CardDbFiltersProps) {
  return (
    <>
      <div className={cardDbToolbarClass}>
        <label className="field">
          <span>Strategy</span>
          <select
            value={dbSource}
            onChange={(event) => {
              onDbSourceChange(event.target.value as CardDatabaseSource);
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
              onSimTypeChange(event.target.value as SimType);
            }}
          >
            {(Object.keys(SIM_TYPE_LABELS) as SimType[]).map((id) => (
              <option key={id} value={id}>
                {SIM_TYPE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <DeckFilterSelect
          value={selectedDeckId ?? ""}
          disabled={contributors.length === 0}
          contributors={contributors}
          onDeckFilterChange={onDeckFilterChange}
        />
        <label className={cn("field", cardDbSearchClass)}>
          <span>Search</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Name, short, or id"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind filter">
          <button
            type="button"
            className={cardDbKindButtonClass(!kindFilter)}
            onClick={() => onKindFilterChange(null)}
          >
            All
          </button>
          {KIND_FILTERS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={cardDbKindButtonClass(kindFilter === kind)}
              onClick={() =>
                onKindFilterChange(kindFilter === kind ? null : kind)
              }
            >
              {kind}
            </button>
          ))}
        </div>
      </div>

      <RunSettingsFilterBar
        value={runSettings}
        available={availableRunSettings}
        onChange={onRunSettingsChange}
      />

      <details className={cardDbSourcesClass}>
        <summary className={cardDbSourcesSummaryClass}>
          Deck sources · {ownershipSummary}
          {totalRuns > 0
            ? ` · ${totalRuns} runs · ${totalSamples.toLocaleString()} samples`
            : ""}
        </summary>
        {contributors.length === 0 ? (
          <p className={cardDbEmptyClass}>No contributing decks yet.</p>
        ) : (
          <ul className={cardDbContributorListClass}>
            {contributors.map((deck) => (
              <li key={deck.deckId} className={cardDbContributorItemClass}>
                <span className={cardDbContributorNameClass}>{deck.name}</span>
                <span className={cardDbContributorMetaClass}>
                  {deck.runCount} run{deck.runCount === 1 ? "" : "s"} ·{" "}
                  {deck.samples.toLocaleString()} samples ·{" "}
                  {formatPct(deck.sampleShare)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}
