"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { VoucherRow } from "@/server/queries/accounting";

const columns: ColumnDef<VoucherRow, unknown>[] = [
  {
    accessorKey: "number",
    header: "Number",
    cell: ({ row }) => (
      <Link href={`/accounting/petty-cash/${row.original.id}`} className="font-medium text-primary hover:underline">
        {row.original.number}
      </Link>
    ),
  },
  { accessorKey: "date", header: "Date", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
  { accessorKey: "fundName", header: "Fund" },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <StatusBadge status={row.original.type === "expense" ? "sent" : "received"}>{row.original.type === "expense" ? "Expense" : "Top-up"}</StatusBadge>,
  },
  { accessorKey: "accountName", header: "Account" },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-72">
        {row.original.description}
        {row.original.payee && <span className="text-muted-foreground"> · {row.original.payee}</span>}
      </span>
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    meta: { align: "right", csv: (r: unknown) => ((r as VoucherRow).type === "expense" ? -(r as VoucherRow).amount : (r as VoucherRow).amount) },
    cell: ({ row }) => <Money value={row.original.type === "expense" ? -row.original.amount : row.original.amount} fixed signed />,
  },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
];

export function VouchersTable({ data, canCreate, toolbar }: { data: VoucherRow[]; canCreate: boolean; toolbar?: React.ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      toolbar={toolbar}
      searchPlaceholder="Search vouchers…"
      exportName="petty-cash-vouchers"
      rowHref={(r) => `/accounting/petty-cash/${r.id}`}
      emptyTitle="No vouchers in this period"
      emptyDescription="Record small cash spends (tea, fares, stationery) and top-ups of the petty cash box."
      emptyAction={
        canCreate ? (
          <Button asChild size="sm">
            <Link href="/accounting/petty-cash/new">
              <Plus className="size-4" />
              New voucher
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
}
