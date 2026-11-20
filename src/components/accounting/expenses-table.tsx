"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { ExpenseRow } from "@/server/queries/accounting";

const columns: ColumnDef<ExpenseRow, unknown>[] = [
  {
    accessorKey: "number",
    header: "Number",
    cell: ({ row }) => (
      <Link href={`/accounting/expenses/${row.original.id}`} className="font-medium text-primary hover:underline">
        {row.original.number}
      </Link>
    ),
  },
  { accessorKey: "date", header: "Date", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
  { accessorKey: "category", header: "Category" },
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
  { accessorKey: "paidFrom", header: "Paid from" },
  { accessorKey: "amount", header: "Amount", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.amount} fixed /> },
  { accessorKey: "taxAmount", header: "Tax", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.taxAmount} fixed muteZero /> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
];

export function ExpensesTable({ data, canCreate, toolbar }: { data: ExpenseRow[]; canCreate: boolean; toolbar?: React.ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      toolbar={toolbar}
      searchPlaceholder="Search expenses…"
      exportName="expenses"
      rowHref={(r) => `/accounting/expenses/${r.id}`}
      emptyTitle="No expenses in this period"
      emptyDescription="Record rent, utilities, fuel and other spending paid from cash, bank or petty cash."
      emptyAction={
        canCreate ? (
          <Button asChild size="sm">
            <Link href="/accounting/expenses/new">
              <Plus className="size-4" />
              Record expense
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
}
