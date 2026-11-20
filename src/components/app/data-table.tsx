"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "./empty-state";

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchPlaceholder?: string;
  /** Extra controls next to the search box (filters, buttons) */
  toolbar?: React.ReactNode;
  /** File name (without .csv) to enable CSV export of the filtered rows */
  exportName?: string;
  /** Navigate when a row is clicked */
  rowHref?: (row: T) => string | null;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Optional totals row, rendered under the body */
  footer?: React.ReactNode;
  initialSorting?: SortingState;
  className?: string;
  dense?: boolean;
}

// Column meta used by this table: right-align numbers, CSV header/value overrides.
export interface ColumnMetaExt {
  align?: "right" | "center";
  csv?: false | ((row: unknown) => string | number | null | undefined);
  className?: string;
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = "Search…",
  toolbar,
  exportName,
  rowHref,
  pageSize = 25,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  footer,
  initialSorting = [],
  className,
  dense,
}: DataTableProps<T>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: "includesString",
  });

  const filteredCount = table.getFilteredRowModel().rows.length;

  const exportCsv = useMemo(
    () => () => {
      const cols = table.getAllLeafColumns().filter((c) => {
        const meta = c.columnDef.meta as ColumnMetaExt | undefined;
        return meta?.csv !== false && c.id !== "actions" && c.id !== "select";
      });
      const header = cols.map((c) => (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id));
      const rows = table.getFilteredRowModel().rows.map((r) =>
        cols.map((c) => {
          const meta = c.columnDef.meta as ColumnMetaExt | undefined;
          return csvEscape(typeof meta?.csv === "function" ? meta.csv(r.original) : r.getValue(c.id));
        })
      );
      const blob = new Blob([[header.map(csvEscape), ...rows].map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${exportName}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    [table, exportName]
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 pl-8"
          />
        </div>
        {toolbar}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filteredCount} {filteredCount === 1 ? "record" : "records"}
          </span>
          {exportName && (
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filteredCount}>
              <Download className="size-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    {hg.headers.map((h) => {
                      const meta = h.column.columnDef.meta as ColumnMetaExt | undefined;
                      const sorted = h.column.getIsSorted();
                      return (
                        <TableHead
                          key={h.id}
                          className={cn(
                            "h-10 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                            meta?.align === "right" && "text-right",
                            meta?.align === "center" && "text-center",
                            meta?.className
                          )}
                        >
                          {h.isPlaceholder ? null : h.column.getCanSort() ? (
                            <button
                              type="button"
                              className={cn("inline-flex items-center gap-1 hover:text-foreground", meta?.align === "right" && "flex-row-reverse")}
                              onClick={h.column.getToggleSortingHandler()}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {sorted === "asc" ? (
                                <ArrowUp className="size-3" />
                              ) : sorted === "desc" ? (
                                <ArrowDown className="size-3" />
                              ) : (
                                <ChevronsUpDown className="size-3 opacity-40" />
                              )}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                      No matching records.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const href = rowHref?.(row.original);
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(href && "cursor-pointer")}
                        onClick={(e) => {
                          // Let buttons/links inside the row do their own thing
                          if (!href || (e.target as HTMLElement).closest("a,button,[role=menuitem],input")) return;
                          router.push(href);
                        }}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const meta = cell.column.columnDef.meta as ColumnMetaExt | undefined;
                          return (
                            <TableCell
                              key={cell.id}
                              className={cn(
                                dense ? "py-1.5" : "py-2.5",
                                meta?.align === "right" && "text-right tabular",
                                meta?.align === "center" && "text-center",
                                meta?.className
                              )}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {footer && <TableFooter>{footer}</TableFooter>}
            </Table>
          </div>
          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
