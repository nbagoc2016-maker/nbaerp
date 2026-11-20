"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { monthLabel } from "@/lib/format";

type Row = {
  id: string;
  runNumber: string;
  period: string;
  runStatus: string;
  gross: number;
  advanceDeduction: number;
  otherDeduction: number;
  net: number;
  paidAmount: number;
  status: string;
};

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "period", header: "Month", cell: ({ row }) => <span className="font-medium">{monthLabel(row.original.period)}</span> },
  { accessorKey: "runNumber", header: "Payroll", cell: ({ row }) => <span className="text-muted-foreground">{row.original.runNumber}</span> },
  { accessorKey: "gross", header: "Gross", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.gross} /> },
  {
    id: "deductions",
    accessorFn: (r) => r.advanceDeduction + r.otherDeduction,
    header: "Deductions",
    meta: { align: "right" },
    cell: ({ getValue }) => <Money value={getValue() as number} muteZero />,
  },
  { accessorKey: "net", header: "Net pay", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.net} className="font-medium" /> },
  { accessorKey: "paidAmount", header: "Paid", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.paidAmount} muteZero /> },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.runStatus === "posted" ? row.original.status : row.original.runStatus} />,
  },
];

export function EmployeePayslipsTable({ data }: { data: Row[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      exportName="payslips"
      rowHref={(r) => `/hr/payroll/payslips/${r.id}`}
      emptyTitle="No payslips yet"
      emptyDescription="A payslip is created for this employee each time payroll is run."
    />
  );
}
