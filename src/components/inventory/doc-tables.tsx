"use client";

// List tables for transfers, adjustments and stock counts.
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, Plus } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatQty } from "@/lib/format";
import { ADJUSTMENT_REASON_LABELS } from "./shared";
import { FilterSelect } from "./url-filters";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "void", label: "Void" },
];

function NewButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild size="sm">
      <Link href={href}>
        <Plus className="size-4" />
        {label}
      </Link>
    </Button>
  );
}

export interface TransferListRow {
  id: string;
  number: string;
  date: string;
  status: string;
  from: string;
  to: string;
  lines: number;
  qty: number;
  notes: string | null;
}

export function TransfersTable({ data, canCreate }: { data: TransferListRow[]; canCreate: boolean }) {
  const [status, setStatus] = useState("");
  const rows = useMemo(() => data.filter((r) => !status || r.status === status), [data, status]);
  const columns = useMemo<ColumnDef<TransferListRow, unknown>[]>(
    () => [
      { accessorKey: "number", header: "Number", cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: "date", header: "Date", cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string)}</span> },
      {
        id: "route",
        header: "From → To",
        accessorFn: (r) => `${r.from} → ${r.to}`,
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {row.original.from}
            <ArrowRight className="size-3.5 text-muted-foreground" />
            {row.original.to}
          </span>
        ),
      },
      { accessorKey: "lines", header: "Items", meta: { align: "right" } },
      { accessorKey: "qty", header: "Units", meta: { align: "right" }, cell: ({ getValue }) => formatQty(getValue() as number) },
      { accessorKey: "notes", header: "Notes", cell: ({ getValue }) => <span className="line-clamp-1 max-w-56 text-muted-foreground">{(getValue() as string) ?? ""}</span> },
      { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
    ],
    []
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="stock-transfers"
      searchPlaceholder="Search number, warehouse…"
      rowHref={(r) => `/inventory/transfers/${r.id}`}
      toolbar={<FilterSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All statuses" className="w-36" />}
      emptyTitle={data.length ? "No transfers with this status" : "No stock transfers yet"}
      emptyDescription={data.length ? undefined : "Move stock between your warehouse and shops. Quantities move at cost, so stock value stays the same."}
      emptyAction={canCreate && !data.length ? <NewButton href="/inventory/transfers/new" label="New transfer" /> : undefined}
    />
  );
}

export interface AdjustmentListRow {
  id: string;
  number: string;
  date: string;
  status: string;
  reason: string;
  warehouse: string;
  lines: number;
  totalValue: number | null;
  notes: string | null;
}

export function AdjustmentsTable({ data, canCreate, canCost }: { data: AdjustmentListRow[]; canCreate: boolean; canCost: boolean }) {
  const [status, setStatus] = useState("");
  const rows = useMemo(() => data.filter((r) => !status || r.status === status), [data, status]);
  const columns = useMemo<ColumnDef<AdjustmentListRow, unknown>[]>(() => {
    const cols: ColumnDef<AdjustmentListRow, unknown>[] = [
      { accessorKey: "number", header: "Number", cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: "date", header: "Date", cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string)}</span> },
      { accessorKey: "warehouse", header: "Warehouse" },
      { accessorKey: "reason", header: "Reason", cell: ({ getValue }) => ADJUSTMENT_REASON_LABELS[getValue() as string] ?? (getValue() as string) },
      { accessorKey: "lines", header: "Items", meta: { align: "right" } },
    ];
    if (canCost)
      cols.push({
        accessorKey: "totalValue",
        header: "Net value",
        meta: { align: "right" },
        cell: ({ row }) => (row.original.status === "draft" ? <span className="text-muted-foreground">—</span> : <Money value={row.original.totalValue} signed />),
      });
    cols.push(
      { accessorKey: "notes", header: "Notes", cell: ({ getValue }) => <span className="line-clamp-1 max-w-56 text-muted-foreground">{(getValue() as string) ?? ""}</span> },
      { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> }
    );
    return cols;
  }, [canCost]);
  return (
    <DataTable
      columns={columns}
      data={rows}
      exportName="stock-adjustments"
      searchPlaceholder="Search number, warehouse, reason…"
      rowHref={(r) => `/inventory/adjustments/${r.id}`}
      toolbar={<FilterSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All statuses" className="w-36" />}
      emptyTitle={data.length ? "No adjustments with this status" : "No stock adjustments yet"}
      emptyDescription={data.length ? undefined : "Record damaged, lost or found stock. Each posting updates stock and the general ledger together."}
      emptyAction={canCreate && !data.length ? <NewButton href="/inventory/adjustments/new" label="New adjustment" /> : undefined}
    />
  );
}

export interface CountListRow {
  id: string;
  number: string;
  date: string;
  status: string;
  warehouse: string;
  lines: number;
  counted: number;
  variances: number;
  varianceValue: number | null;
}

export function CountsTable({ data, canCreate, canCost }: { data: CountListRow[]; canCreate: boolean; canCost: boolean }) {
  const columns = useMemo<ColumnDef<CountListRow, unknown>[]>(() => {
    const cols: ColumnDef<CountListRow, unknown>[] = [
      { accessorKey: "number", header: "Number", cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
      { accessorKey: "date", header: "Date", cell: ({ getValue }) => <span className="whitespace-nowrap">{formatDate(getValue() as string)}</span> },
      { accessorKey: "warehouse", header: "Warehouse" },
      {
        id: "progress",
        header: "Counted",
        accessorFn: (r) => (r.lines ? r.counted / r.lines : 0),
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.counted} / {row.original.lines}
            <span className="ml-1 text-xs text-muted-foreground">({row.original.lines ? Math.round((row.original.counted / row.original.lines) * 100) : 0}%)</span>
          </span>
        ),
      },
      { accessorKey: "variances", header: "Variances", meta: { align: "right" } },
    ];
    if (canCost) cols.push({ accessorKey: "varianceValue", header: "Variance value", meta: { align: "right" }, cell: ({ getValue }) => <Money value={getValue() as number} signed muteZero /> });
    cols.push({ accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> });
    return cols;
  }, [canCost]);
  return (
    <DataTable
      columns={columns}
      data={data}
      exportName="stock-counts"
      searchPlaceholder="Search number or warehouse…"
      rowHref={(r) => `/inventory/counts/${r.id}`}
      emptyTitle="No stock counts yet"
      emptyDescription="Start a physical stock take: the system quantities are frozen, you enter what you counted, and only the differences are posted."
      emptyAction={canCreate ? <NewButton href="/inventory/counts/new" label="Start a count" /> : undefined}
    />
  );
}
