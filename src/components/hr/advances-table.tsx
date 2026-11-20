"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDate } from "@/lib/format";
import type { AdvanceRow } from "@/server/queries/hr";
import { EmployeeCell } from "./employee-avatar";

type Row = Omit<AdvanceRow, "employee" | "code"> & { employee?: string; code?: string };

export function AdvancesTable({ data, hideEmployee, emptyAction }: { data: Row[]; hideEmployee?: boolean; emptyAction?: React.ReactNode }) {
  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: "number", header: "Number", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    ...(hideEmployee
      ? []
      : [
          {
            accessorKey: "employee",
            header: "Employee",
            cell: ({ row }) => <EmployeeCell name={row.original.employee ?? ""} code={row.original.code} />,
          } as ColumnDef<Row, unknown>,
        ]),
    { accessorKey: "kind", header: "Type", cell: ({ row }) => (row.original.kind === "loan" ? "Loan" : "Advance") },
    { accessorKey: "amount", header: "Amount", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.amount} /> },
    { accessorKey: "installmentAmount", header: "Per payroll", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.installmentAmount} /> },
    {
      id: "recovered",
      accessorFn: (r) => (r.status === "void" ? 0 : r.amount - r.balance),
      header: "Recovered",
      meta: { align: "right" },
      cell: ({ getValue }) => <Money value={getValue() as number} muteZero />,
    },
    {
      accessorKey: "balance",
      header: "Balance",
      meta: { align: "right" },
      cell: ({ row }) => <Money value={row.original.balance} muteZero className={row.original.balance > 0 ? "font-semibold" : undefined} />,
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      exportName="employee-advances"
      searchPlaceholder="Search number, employee…"
      rowHref={(r) => `/hr/advances/${r.id}`}
      emptyTitle="No advances or loans"
      emptyDescription="Salary advances and staff loans paid out are listed here and recovered automatically from payroll."
      emptyAction={emptyAction}
    />
  );
}
