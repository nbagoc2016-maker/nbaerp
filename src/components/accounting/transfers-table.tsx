"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { TransferRow } from "@/server/queries/accounting";

const columns: ColumnDef<TransferRow, unknown>[] = [
  {
    accessorKey: "number",
    header: "Number",
    cell: ({ row }) => (
      <Link href={`/accounting/banking/transfers/${row.original.id}`} className="font-medium text-primary hover:underline">
        {row.original.number}
      </Link>
    ),
  },
  { accessorKey: "date", header: "Date", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
  { accessorKey: "fromName", header: "From" },
  { accessorKey: "toName", header: "To" },
  { accessorKey: "reference", header: "Reference", cell: ({ row }) => row.original.reference ?? "—" },
  { accessorKey: "amount", header: "Amount", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.amount} fixed /> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
];

export function TransfersTable({ data, canTransfer, toolbar, pageSize }: { data: TransferRow[]; canTransfer: boolean; toolbar?: React.ReactNode; pageSize?: number }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      toolbar={toolbar}
      pageSize={pageSize}
      searchPlaceholder="Search transfers…"
      exportName="bank-transfers"
      rowHref={(r) => `/accounting/banking/transfers/${r.id}`}
      emptyTitle="No transfers yet"
      emptyDescription="Record cash deposits, withdrawals and moves between your bank accounts and wallets."
      emptyAction={
        canTransfer ? (
          <Button asChild size="sm">
            <Link href="/accounting/banking/transfers/new">
              <ArrowLeftRight className="size-4" />
              Transfer money
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
}
