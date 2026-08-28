import type { ReactNode } from "react";

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
      className={["data-table", className].filter(Boolean).join(" ")}
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
                className={[
                  column.metric ? "is-metric" : undefined,
                  sortable ? "is-sortable" : undefined,
                  isSorted ? "is-sorted" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
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
                <span className="data-table-header-cell">
                  {sortable ? (
                    <button
                      type="button"
                      className="data-table-sort"
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
                className={column.metric ? "is-metric" : undefined}
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
