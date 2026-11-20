"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDate, formatQty } from "@/lib/format";
import { RemainingBar } from "./shared";

export interface BatchRow {
  id: string;
  batchNo: string;
  shade: string | null;
  initialQty: number;
  qty: number;
  unitCost: number | null;
  receivedDate: string | null;
  productId: string;
  product: string;
  sku: string;
  unit: string;
  warehouse: string;
}

export function BatchesTable({ rows, canCost }: { rows: BatchRow[]; canCost: boolean }) {
  const columns = useMemo<ColumnDef<BatchRow, unknown>[]>(() => {
    const cols: ColumnDef<BatchRow, unknown>[] = [
      { accessorKey: "batchNo", header: "Roll / batch", cell: ({ getValue }) => <span className="font-medium tabular">{getValue() as string}</span> },
      {
        accessorKey: "product",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-44">
            <Link href={`/inventory/products/${row.original.productId}`} className="hover:underline">
              {row.original.product}
            </Link>
            <span className="block text-xs text-muted-foreground">{row.original.sku}</span>
          </div>
        ),
      },
      { accessorKey: "warehouse", header: "Warehouse" },
      { accessorKey: "shade", header: "Shade", cell: ({ getValue }) => (getValue() as string) ?? <span className="text-muted-foreground">—</span> },
      {
        id: "remaining",
        header: "Remaining",
        accessorFn: (r) => (r.initialQty > 0 ? r.qty / r.initialQty : 0),
        cell: ({ row }) => (
          <div className="w-36 space-y-1">
            <RemainingBar value={row.original.qty} max={row.original.initialQty} />
            <span className="text-xs text-muted-foreground">{row.original.initialQty > 0 ? Math.round((row.original.qty / row.original.initialQty) * 100) : 0}% left</span>
          </div>
        ),
        meta: { csv: false },
      },
      { accessorKey: "initialQty", header: "Initial", meta: { align: "right" }, cell: ({ row }) => `${formatQty(row.original.initialQty)} ${row.original.unit}` },
      {
        accessorKey: "qty",
        header: "Left",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.qty > 0 ? (
            <span className="font-medium">
              {formatQty(row.original.qty)} {row.original.unit}
            </span>
          ) : (
            <StatusBadge status="closed">Used up</StatusBadge>
          ),
      },
    ];
    if (canCost) cols.push({ accessorKey: "unitCost", header: "Unit cost", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} /> });
    cols.push({ accessorKey: "receivedDate", header: "Received", cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string)}</span> });
    return cols;
  }, [canCost]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="rolls-batches"
      searchPlaceholder="Search roll no., product, shade…"
      pageSize={50}
      emptyTitle="No rolls or batches"
      emptyDescription="Turn on “Track rolls / batches” for a product, then receive stock with roll numbers to see each thaan or lot here."
    />
  );
}
