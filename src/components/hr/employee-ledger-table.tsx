"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { formatDate } from "@/lib/format";
import type { LedgerRow } from "@/server/queries/hr";

const sourceHref = (r: LedgerRow) =>
  r.sourceType === "employee_advance" && r.sourceId ? `/hr/advances/${r.sourceId}` : r.sourceType === "payroll" && r.sourceId ? `/hr/payroll/${r.sourceId}` : null;

const balanceLabel = (b: number) => (b > 0 ? "owes us" : b < 0 ? "due to them" : "");

const columns: ColumnDef<LedgerRow, unknown>[] = [
  { accessorKey: "date", header: "Date", enableSorting: false, cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
  {
    accessorKey: "sourceNumber",
    header: "Reference",
    enableSorting: false,
    cell: ({ row }) => {
      const href = sourceHref(row.original);
      const label = row.original.sourceNumber ?? row.original.entryNumber;
      return href ? (
        <Link href={href} className="font-medium text-primary hover:underline">
          {label}
        </Link>
      ) : (
        <span className="font-medium">{label}</span>
      );
    },
  },
  { accessorKey: "description", header: "Description", enableSorting: false },
  {
    accessorKey: "accountName",
    header: "Account",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.accountCode} · {row.original.accountName}
      </span>
    ),
  },
  { accessorKey: "debit", header: "Debit", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.debit} muteZero /> },
  { accessorKey: "credit", header: "Credit", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.credit} muteZero /> },
  {
    accessorKey: "balance",
    header: "Balance",
    enableSorting: false,
    meta: { align: "right", csv: (r: unknown) => (r as LedgerRow).balance },
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <Money value={Math.abs(row.original.balance)} className="font-medium" />
        <span className="ml-1 text-xs text-muted-foreground">{balanceLabel(row.original.balance)}</span>
      </span>
    ),
  },
];

/** GL lines tagged with the employee (advances 1500, salaries payable 2300) with a running balance. */
export function EmployeeLedgerTable({ data }: { data: LedgerRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      pageSize={50}
      exportName="employee-ledger"
      searchPlaceholder="Search ledger…"
      emptyTitle="No ledger entries yet"
      emptyDescription="Advances paid, salaries booked by payroll and salary payments for this employee show up here straight from the general ledger."
    />
  );
}
