"use client";

import { InfoPopover } from "@/components/info-popover";
import type { CardDatabasePairingsResponse } from "@/lib/api/client";
import {
  DataTable,
  sortDataTableRows,
  type DataTableColumn,
  type DataTableSort,
} from "../../ui";
import { PARTNER_MODES, type PartnerMode } from "./constants";
import {
  formatDmg,
  formatLift,
  partnerDelta,
} from "./formatters";
import {
  cardDbEmptyClass,
  cardDbPartnerModeButtonClass,
  cardDbPartnerModesClass,
  cardDbPartnersClass,
  partnerDeltaClass,
} from "./shared";

export interface CardPartnersSectionProps {
  readonly pairings: CardDatabasePairingsResponse | null;
  readonly selectedName: string;
  readonly mode: PartnerMode;
  readonly onModeChange: (mode: PartnerMode) => void;
  readonly sort: DataTableSort;
  readonly onSortChange: (sort: DataTableSort) => void;
}

export function CardPartnersSection({
  pairings,
  selectedName,
  mode,
  onModeChange,
  sort,
  onSortChange,
}: CardPartnersSectionProps) {
  if (!pairings || pairings.totalSamples === 0) {
    return (
      <p className={cardDbEmptyClass}>No evaluate samples for this version.</p>
    );
  }

  if (pairings.partners.length === 0) {
    return (
      <p className={cardDbEmptyClass}>
        No partners with enough opening-hand samples for mean comparison.
      </p>
    );
  }

  const columns: Array<DataTableColumn<(typeof pairings.partners)[number]>> = [
    {
      id: "partner",
      header: "Card",
      sortable: true,
      sortValue: (row) => row.name,
      cell: (row) => row.name,
    },
    {
      id: "delta",
      header: mode === "pairs_with_me" ? "Lift" : "Depends",
      metric: true,
      sortable: true,
      sortValue: (row) => partnerDelta(row, mode),
      cell: (row) => {
        const delta = partnerDelta(row, mode);
        return (
          <span className={partnerDeltaClass(delta)}>
            {formatLift(delta)}
          </span>
        );
      },
    },
    {
      id: "bothMean",
      header: "Both",
      metric: true,
      sortable: true,
      sortValue: (row) => row.bothMean,
      cell: (row) => formatDmg(row.bothMean),
    },
    {
      id: "selectedWithoutPartner",
      header: `${selectedName} alone`,
      metric: true,
      sortable: true,
      sortValue: (row) => row.selectedWithoutPartnerMean,
      cell: (row) => formatDmg(row.selectedWithoutPartnerMean),
    },
    {
      id: "partnerWithoutSelected",
      header: "Partner alone",
      metric: true,
      sortable: true,
      sortValue: (row) => row.partnerWithoutSelectedMean,
      cell: (row) => formatDmg(row.partnerWithoutSelectedMean),
    },
    {
      id: "samples",
      header: "Samples",
      headerHelp: (
        <InfoPopover hideLabel label="Samples">
          Opening-hand sample counts for each mean: both cards / {selectedName}{" "}
          without partner / partner without {selectedName}.
        </InfoPopover>
      ),
      metric: true,
      sortable: true,
      sortValue: (row) => row.bothCount,
      cell: (row) =>
        `${row.bothCount} / ${row.selectedWithoutPartnerCount} / ${row.partnerWithoutSelectedCount}`,
    },
  ];

  const rows = sortDataTableRows(pairings.partners, columns, sort);

  return (
    <div className={cardDbPartnersClass}>
      <div
        className={cardDbPartnerModesClass}
        role="tablist"
        aria-label="Partner analysis mode"
      >
        {PARTNER_MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={mode === entry.id}
            className={cardDbPartnerModeButtonClass(mode === entry.id)}
            onClick={() => onModeChange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.cardId}
        sort={sort}
        onSortChange={onSortChange}
      />
    </div>
  );
}
