"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDate, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SOURCE_LABELS, sourceHref } from "./source-links";

export interface MovementRow {
  id: string;
  date: string;
  productId: string;
  product: string;
  sku: string;
  unit: string;
  warehouse: string;
  batchNo: string | null;
  qty: number;
  unitCost: number | null;
  value: number | null;
  running: number;
  sourceType: string;
  kind: string;
  sourceId: string | null;
  sourceNumber: string | null;
  notes: string | null;
  user: string | null;
}

export function MovementsTable({
  rows,
  canCost,
  runningLabel,
  opening,
}: {
  rows: MovementRow[];
  canCost: boolean;
  runningLabel: string;
  opening: { qty: number; value: number | null } | null;
}) {
  const columns = useMemo<ColumnDef<MovementRow, unknown>[]>(() => {
    const cols: ColumnDef<MovementRow, unknown>[] = [
      { accessorKey: "date", header: "Date", cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string)}</span> },
      {
        accessorKey: "product",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-44">
            <Link href={`/inventory/products/${row.original.productId}`} className="hover:underline">
              {row.original.product}
            </Link>
            <span className="block text-xs text-muted-foreground">
              {row.original.sku}
              {row.original.batchNo ? ` · roll ${row.original.batchNo}` : ""}
            </span>
          </div>
        ),
      },
      { accessorKey: "warehouse", header: "Warehouse" },
      {
        id: "source",
        header: "Source",
        accessorFn: (r) => `${SOURCE_LABELS[r.sourceType] ?? r.sourceType} ${r.sourceNumber ?? ""}`,
        cell: ({ row }) => {
          const r = row.original;
          const reversal = r.sourceType === "adjustment" && (r.kind !== "adjustment" || r.sourceNumber === "void" || !!r.sourceNumber?.endsWith("(void)"));
          const href = sourceHref(r.kind, r.sourceId);
          return (
            <div className="min-w-32">
              <span className="block text-xs text-muted-foreground">{reversal ? "Reversal (void)" : SOURCE_LABELS[r.sourceType]}</span>
              {href ? (
                <Link href={href} className="font-medium hover:underline">
                  {r.sourceNumber ?? "Open"}
                </Link>
              ) : (
                <span className="font-medium">{r.sourceNumber ?? "—"}</span>
              )}
            </div>
          );
        },
      },
      {
        id: "in",
        header: "In",
        accessorFn: (r) => (r.qty > 0 ? r.qty : 0),
        meta: { align: "right" },
        cell: ({ row }) => (row.original.qty > 0 ? <span className="font-medium text-success">+{formatQty(row.original.qty)}</span> : ""),
      },
      {
        id: "out",
        header: "Out",
        accessorFn: (r) => (r.qty < 0 ? -r.qty : 0),
        meta: { align: "right" },
        cell: ({ row }) => (row.original.qty < 0 ? <span className="font-medium text-destructive">-{formatQty(-row.original.qty)}</span> : ""),
      },
    ];
    if (canCost) {
      cols.push(
        { accessorKey: "unitCost", header: "Unit cost", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} /> },
        { accessorKey: "value", header: "Value", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} signed /> }
      );
    }
    cols.push(
      {
        accessorKey: "running",
        header: runningLabel,
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className={cn("tabular", row.original.running < 0 && "text-destructive")}>
            {formatQty(row.original.running)} <span className="text-xs text-muted-foreground">{row.original.unit}</span>
          </span>
        ),
      },
      { accessorKey: "user", header: "By", cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground">{(getValue() as string) ?? "System"}</span> }
    );
    return cols;
  }, [canCost, runningLabel]);

  const inQty = rows.reduce((t, r) => t + (r.qty > 0 ? r.qty : 0), 0);
  const outQty = rows.reduce((t, r) => t + (r.qty < 0 ? -r.qty : 0), 0);
  const value = rows.reduce((t, r) => t + (r.value ?? 0), 0);

  return (
    <div className="space-y-3">
      {opening && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
          <span>
            <span className="text-muted-foreground">Opening balance: </span>
            <span className="font-medium tabular">{formatQty(opening.qty)}</span>
          </span>
          {canCost && opening.value !== null && (
            <span>
              <span className="text-muted-foreground">Opening value: </span>
              <Money value={opening.value} className="font-medium" />
            </span>
          )}
          <span>
            <span className="text-muted-foreground">Closing balance: </span>
            <span className="font-medium tabular">{formatQty(opening.qty + inQty - outQty)}</span>
          </span>
        </div>
      )}
      <DataTable
        columns={columns}
        data={rows}
        exportName="stock-movements"
        searchPlaceholder="Search product, document…"
        pageSize={50}
        dense
        emptyTitle="No stock movements in this period"
        emptyDescription="Every receipt, sale, transfer, adjustment and count writes a line to this ledger. Try a wider date range or fewer filters."
        footer={
          rows.length > 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="font-semibold">
                Totals
              </TableCell>
              <TableCell className="text-right font-semibold tabular text-success">+{formatQty(inQty)}</TableCell>
              <TableCell className="text-right font-semibold tabular text-destructive">-{formatQty(outQty)}</TableCell>
              {canCost && <TableCell />}
              {canCost && (
                <TableCell className="text-right font-semibold">
                  <Money value={value} signed />
                </TableCell>
              )}
              <TableCell colSpan={2} />
            </TableRow>
          ) : undefined
        }
      />
    </div>
  );
}
