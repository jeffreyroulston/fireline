import { type SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import type { RunHistoryRow } from "@/lib/api/client";
import { InfoPopover } from "@/components/info-popover";
import { cn } from "@/lib/utils/cn";
import { SectionHeading } from "../../ui";
import { SIM_TYPE_LABELS } from "../../types";
import { HistoryStatus } from "./history-status";
import {
  historyActionsCellClass,
  historyDeleteButtonClass,
  historyEmptyClass,
  historyMonoCellClass,
  historyPanelClass,
  historyResultCellClass,
  historyTableWrapClass,
  formatRunTime,
  formatVersionShort,
  formatWhen,
  handsLabel,
  resultLabel,
  runSettingsLines,
} from "./shared";

type HistoryRunTableProps = Readonly<{
  runs: RunHistoryRow[];
  decks: SavedDeck[];
  filterDeckId: string | null;
  selectedDeck: SavedDeck | null;
  deletingId: string | null;
  onDeleteRun: (runId: string) => void;
}>;

export function HistoryRunTable({
  runs,
  decks,
  filterDeckId,
  selectedDeck,
  deletingId,
  onDeleteRun,
}: HistoryRunTableProps) {
  return (
    <section className={historyPanelClass}>
      <SectionHeading
        title="RUN HISTORY"
        meta={<strong>{runs.length} runs</strong>}
      />
      {runs.length === 0 ? (
        <p className={historyEmptyClass}>
          No completed runs yet
          {filterDeckId && selectedDeck ? ` for ${selectedDeck.name}` : ""}. Finish
          an evaluate or optimize to fill this table.
        </p>
      ) : (
        <div className={cn(historyTableWrapClass, "overflow-visible pb-10")}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Deck</th>
                <th>Kind</th>
                <th>Sim</th>
                <th>Hands</th>
                <th>Runtime</th>
                <th>Status</th>
                <th>Version</th>
                <th>Result</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const settings = runSettingsLines(run);
                const simLabel = run.simType
                  ? (SIM_TYPE_LABELS[run.simType as SimType] ?? run.simType)
                  : "—";
                return (
                  <tr key={run.id}>
                    <td>{formatWhen(run.startedAt)}</td>
                    <td>
                      {(run.deckId &&
                        decks.find((deck) => deck.id === run.deckId)?.name) ||
                        run.deckName ||
                        "—"}
                    </td>
                    <td className={historyMonoCellClass}>{run.kind}</td>
                    <td>
                      {settings.length > 0 ? (
                        <span className="inline-flex items-center gap-[5px]">
                          {simLabel}
                          <InfoPopover hideLabel label="Run settings">
                            <ul className="m-0 grid list-none gap-1 p-0">
                              {settings.map((line) => (
                                <li key={line} className="leading-snug">
                                  {line}
                                </li>
                              ))}
                            </ul>
                          </InfoPopover>
                        </span>
                      ) : (
                        simLabel
                      )}
                    </td>
                    <td className={historyMonoCellClass}>{handsLabel(run)}</td>
                    <td className={historyMonoCellClass}>
                      {formatRunTime(run.elapsedMs)}
                    </td>
                    <td>
                      <HistoryStatus
                        status={run.status}
                        errorMessage={run.errorMessage}
                      />
                    </td>
                    <td className={historyMonoCellClass}>
                      {formatVersionShort(run)}
                    </td>
                    <td className={historyResultCellClass}>
                      {resultLabel(run)}
                    </td>
                    <td className={historyActionsCellClass}>
                      <button
                        type="button"
                        className={historyDeleteButtonClass}
                        disabled={deletingId != null}
                        onClick={() => onDeleteRun(run.id)}
                      >
                        {deletingId === run.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
