"use client";

import type { CardPlayMatrixResponse } from "@/lib/api/client";
import { DataTable, type DataTableColumn } from "../../ui";
import { formatPct, phaseLabel, phaseRank } from "./formatters";
import {
  cardDbEmptyClass,
  cardDbPlayMetaClass,
  cardDbPlayWrapClass,
} from "./shared";

export interface PlayTimingListProps {
  readonly matrix: CardPlayMatrixResponse;
}

export function PlayTimingList({ matrix }: PlayTimingListProps) {
  if (matrix.totalPlays === 0 || matrix.cells.length === 0) {
    return (
      <p className={cardDbEmptyClass}>
        No play events in stored sample lines for this version.
      </p>
    );
  }

  const rows = [...matrix.cells].sort((a, b) => {
    if (a.turn !== b.turn) return a.turn - b.turn;
    return phaseRank(a.phase) - phaseRank(b.phase);
  });

  const columns: Array<DataTableColumn<(typeof rows)[number]>> = [
    { id: "turn", header: "Turn", cell: (row) => row.turn },
    {
      id: "phase",
      header: "Phase",
      cell: (row) => phaseLabel(row.phase),
    },
    {
      id: "share",
      header: "Share",
      metric: true,
      cell: (row) => formatPct(row.shareOfPlays),
    },
    {
      id: "plays",
      header: "Plays",
      metric: true,
      cell: (row) => row.plays.toLocaleString(),
    },
    {
      id: "perSample",
      header: "Per sample",
      metric: true,
      cell: (row) => row.perSample.toFixed(2),
    },
  ];

  return (
    <div className={cardDbPlayWrapClass}>
      <p className={cardDbPlayMetaClass}>
        {matrix.totalPlays.toLocaleString()} plays across{" "}
        {matrix.totalSamples.toLocaleString()} samples
      </p>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => `${row.turn}:${row.phase}`}
      />
    </div>
  );
}
