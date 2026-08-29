import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type DataTableSort = {
  columnId: string;
  direction: "asc" | "desc";
};

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  headerHelp?: ReactNode;
  metric?: boolean;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
};

function compareSortValues(
  left: string | number,
  right: string | number,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortDataTableRows<T>(
  rows: T[],
  columns: Array<DataTableColumn<T>>,
  sort: DataTableSort | null | undefined,
): T[] {
  if (!sort) {
    return rows;
  }
  const column = columns.find((entry) => entry.id === sort.columnId);
  if (!column?.sortable || !column.sortValue) {
    return rows;
  }
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) => direction * compareSortValues(column.sortValue!(a), column.sortValue!(b)),
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  className,
  sort,
  onSortChange,
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  className?: string;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
}) {
  return (
    <table
      className={cn(
        "w-full border-collapse text-[0.9em] tabular-nums",
        className,
      )}
    >
      <thead>
        <tr>
          {columns.map((column) => {
            const isSorted = sort?.columnId === column.id;
            const sortable = column.sortable && column.sortValue && onSortChange;
            return (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  "border-b border-border py-2.5 pr-4 text-left text-[0.72rem] font-normal tracking-[0.04em] text-muted uppercase last:pr-0",
                  column.metric && "text-right",
                  isSorted && "[&_.data-table-sort]:text-foreground",
                )}
                aria-sort={
                  isSorted
                    ? sort!.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : sortable
                      ? "none"
                      : undefined
                }
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    column.metric && "flex w-full justify-end",
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="data-table-sort inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-[inherit] tracking-[inherit] uppercase hover:text-foreground focus-visible:text-foreground"
                      onClick={() => {
                        if (isSorted && sort!.direction === "desc") {
                          onSortChange!({
                            columnId: column.id,
                            direction: "asc",
                          });
                          return;
                        }
                        onSortChange!({
                          columnId: column.id,
                          direction: "desc",
                        });
                      }}
                    >
                      {column.header}
                    </button>
                  ) : (
                    column.header
                  )}
                  {column.headerHelp}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td
                key={column.id}
                className={cn(
                  "border-b border-border py-2.5 pr-4 text-left font-normal text-foreground last:pr-0",
                  column.metric && "text-right text-muted",
                )}
              >
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
