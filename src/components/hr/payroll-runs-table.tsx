"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { formatDate } from "@/lib/format";
import type { RunRow } from "@/server/queries/hr";

const columns: ColumnDef<RunRow, unknown>[] = [
  {
    accessorKey: "periodLabel",
    header: "Period",
    cell: ({ row }) => (
      <div>
        <p className="font-medium">{row.original.periodLabel}</p>
        <p className="text-xs text-muted-foreground">
          {row.original.number} · {row.original.employees} employee{row.original.employees === 1 ? "" : "s"}
        </p>
      </div>
    ),
  },
  { accessorKey: "date", header: "Posting date", cell: ({ row }) => formatDate(row.original.date) },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { accessorKey: "totalGross", header: "Gross", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.totalGross} /> },
  { accessorKey: "totalDeductions", header: "Deductions", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.totalDeductions} muteZero /> },
  { accessorKey: "totalNet", header: "Net pay", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.totalNet} className="font-medium" /> },
  {
    accessorKey: "totalPaid",
    header: "Paid",
    meta: { align: "right" },
    cell: ({ row }) => {
      const r = row.original;
      if (r.status !== "posted") return <span className="text-muted-foreground">—</span>;
      const due = r.totalNet - r.totalPaid;
      return (
        <div>
          <Money value={r.totalPaid} />
          {due > 0.005 && (
            <p className="text-xs text-destructive">
              <Money value={due} /> due
            </p>
          )}
        </div>
      );
    },
  },
];

export function PayrollRunsTable({ data, emptyAction }: { data: RunRow[]; emptyAction?: React.ReactNode }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      exportName="payroll-runs"
      searchPlaceholder="Search month or number…"
      rowHref={(r) => `/hr/payroll/${r.id}`}
      emptyTitle="No payroll runs yet"
      emptyDescription="Run payroll once a month: payslips are calculated from salaries, attendance and advances, then posted and paid."
      emptyAction={emptyAction}
    />
  );
}
