"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ShoppingCart } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StockBadge, stockState } from "./shared";

export interface StockRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  brand: string | null;
  reorderLevel: number;
  reorderQty: number;
  /** qty per warehouse id */
  per: Record<string, number>;
  qty: number;
  avgCost: number | null;
  value: number | null;
}

const qtyCell = (v: number) => <span className={cn("tabular", v < 0 && "text-destructive", v === 0 && "text-muted-foreground")}>{v === 0 ? "—" : formatQty(v)}</span>;

/** Product × warehouse matrix, or a single-warehouse list when `warehouseId` is set. */
export function StockOnHandTable({
  rows,
  warehouses,
  warehouseId,
  canCost,
}: {
  rows: StockRow[];
  warehouses: { id: string; name: string; code: string }[];
  warehouseId: string | null;
  canCost: boolean;
}) {
  const columns = useMemo<ColumnDef<StockRow, unknown>[]>(() => {
    const cols: ColumnDef<StockRow, unknown>[] = [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-48">
            <Link href={`/inventory/products/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
            <span className="block text-xs text-muted-foreground">
              {row.original.sku}
              {row.original.category ? ` · ${row.original.category}` : ""}
            </span>
          </div>
        ),
      },
      { accessorKey: "sku", header: "SKU", meta: { className: "hidden" } },
      { accessorKey: "unit", header: "Unit" },
    ];
    if (!warehouseId && warehouses.length > 1) {
      for (const w of warehouses) {
        cols.push({
          id: `wh_${w.id}`,
          header: w.code,
          accessorFn: (r) => r.per[w.id] ?? 0,
          meta: { align: "right" },
          cell: ({ getValue }) => qtyCell(getValue() as number),
        });
      }
    }
    cols.push({ accessorKey: "qty", header: warehouseId || warehouses.length <= 1 ? "On hand" : "Total", meta: { align: "right" }, cell: ({ getValue }) => <span className="font-medium">{qtyCell(getValue() as number)}</span> });
    if (canCost) {
      cols.push(
        { accessorKey: "avgCost", header: "Avg cost", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} muteZero /> },
        { accessorKey: "value", header: "Value", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} muteZero /> }
      );
    }
    cols.push(
      { accessorKey: "reorderLevel", header: "Reorder at", meta: { align: "right" }, cell: ({ getValue }) => qtyCell(getValue() as number) },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => stockState(r.qty, r.reorderLevel),
        cell: ({ row }) => <StockBadge qty={row.original.qty} reorderLevel={row.original.reorderLevel} />,
      }
    );
    return cols;
  }, [warehouses, warehouseId, canCost]);

  const total = rows.reduce((t, r) => ({ qty: t.qty + r.qty, value: t.value + (r.value ?? 0) }), { qty: 0, value: 0 });
  const perTotals = warehouses.map((w) => rows.reduce((t, r) => t + (r.per[w.id] ?? 0), 0));
  const showMatrix = !warehouseId && warehouses.length > 1;

  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="stock-on-hand"
      searchPlaceholder="Search product or SKU…"
      rowHref={(r) => `/inventory/products/${r.id}`}
      pageSize={50}
      emptyTitle="No stock to show"
      emptyDescription="Stock appears here once products are received, opened or adjusted in."
      footer={
        rows.length > 0 ? (
          <TableRow>
            <TableCell className="font-semibold">Total ({rows.length} items)</TableCell>
            <TableCell className="hidden" />
            <TableCell />
            {showMatrix && perTotals.map((t, i) => <TableCell key={warehouses[i].id} className="text-right tabular">{formatQty(t)}</TableCell>)}
            <TableCell className="text-right font-semibold tabular">{formatQty(total.qty)}</TableCell>
            {canCost && <TableCell />}
            {canCost && <TableCell className="text-right font-semibold tabular">{formatMoney(total.value)}</TableCell>}
            <TableCell />
            <TableCell />
          </TableRow>
        ) : undefined
      }
    />
  );
}

export interface ReorderRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  qty: number;
  reorderLevel: number;
  reorderQty: number;
  suggested: number;
  estCost: number | null;
}

export function ReorderTable({ rows, canCost, canPurchase }: { rows: ReorderRow[]; canCost: boolean; canPurchase: boolean }) {
  const columns = useMemo<ColumnDef<ReorderRow, unknown>[]>(() => {
    const cols: ColumnDef<ReorderRow, unknown>[] = [
      {
        accessorKey: "name",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-48">
            <Link href={`/inventory/products/${row.original.id}`} className="font-medium hover:underline">
              {row.original.name}
            </Link>
            <span className="block text-xs text-muted-foreground">{row.original.sku}</span>
          </div>
        ),
      },
      { accessorKey: "category", header: "Category", cell: ({ getValue }) => (getValue() as string) ?? "—" },
      { accessorKey: "qty", header: "On hand", meta: { align: "right" }, cell: ({ row }) => <span className={cn(row.original.qty <= 0 && "text-destructive")}>{formatQty(row.original.qty)} {row.original.unit}</span> },
      { accessorKey: "reorderLevel", header: "Reorder level", meta: { align: "right" }, cell: ({ getValue }) => formatQty(getValue() as number) },
      { accessorKey: "reorderQty", header: "Reorder qty", meta: { align: "right" }, cell: ({ getValue }) => formatQty(getValue() as number) },
      {
        accessorKey: "suggested",
        header: "Suggested order",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="font-semibold text-primary">
            {formatQty(row.original.suggested)} {row.original.unit}
          </span>
        ),
      },
    ];
    if (canCost) cols.push({ accessorKey: "estCost", header: "Est. cost", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} /> });
    cols.push({
      id: "status",
      header: "Status",
      accessorFn: (r) => stockState(r.qty, r.reorderLevel),
      cell: ({ row }) => <StockBadge qty={row.original.qty} reorderLevel={row.original.reorderLevel} />,
    });
    return cols;
  }, [canCost]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="reorder-suggestions"
      searchPlaceholder="Search product…"
      rowHref={(r) => `/inventory/products/${r.id}`}
      emptyTitle="Nothing to reorder"
      emptyDescription="Every product with a reorder level is above it. Set reorder levels on products to get suggestions here."
      toolbar={
        canPurchase && rows.length > 0 ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/purchasing/orders/new">
              <ShoppingCart className="size-4" />
              New purchase order
            </Link>
          </Button>
        ) : undefined
      }
      footer={
        canCost && rows.length > 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="font-semibold">
              Estimated total
            </TableCell>
            <TableCell className="text-right font-semibold tabular">{formatMoney(rows.reduce((t, r) => t + (r.estCost ?? 0), 0))}</TableCell>
            <TableCell />
          </TableRow>
        ) : undefined
      }
    />
  );
}
