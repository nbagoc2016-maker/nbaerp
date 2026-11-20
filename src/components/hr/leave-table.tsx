"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Check, X } from "lucide-react";
import { decideLeaveAction } from "@/app/(app)/hr/leave/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { formatDate, formatQty } from "@/lib/format";
import type { LeaveRow } from "@/server/queries/hr";
import { EmployeeCell } from "./employee-avatar";

function DecisionButtons({ row }: { row: LeaveRow }) {
  const { run, pending } = useAction();
  if (row.status === "pending") {
    return (
      <div className="flex justify-end gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-success hover:text-success"
          disabled={pending}
          onClick={() => run(() => decideLeaveAction({ id: row.id, decision: "approved" }), { success: `Leave approved for ${row.employee}` })}
        >
          <Check className="size-3.5" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => run(() => decideLeaveAction({ id: row.id, decision: "rejected" }), { success: "Leave rejected" })}
        >
          <X className="size-3.5" />
          Reject
        </Button>
      </div>
    );
  }
  if (row.status === "approved") {
    return (
      <div className="flex justify-end">
        <ConfirmButton
          variant="ghost"
          title="Cancel this approved leave?"
          description="The leave days marked in attendance will be cleared."
          confirmLabel="Cancel leave"
          onConfirm={() => decideLeaveAction({ id: row.id, decision: "cancelled" })}
          success="Leave cancelled"
        >
          Cancel
        </ConfirmButton>
      </div>
    );
  }
  return null;
}

export function LeaveTable({
  data,
  canDecide,
  hideEmployee,
  emptyAction,
}: {
  data: LeaveRow[];
  canDecide: boolean;
  hideEmployee?: boolean;
  emptyAction?: React.ReactNode;
}) {
  const columns: ColumnDef<LeaveRow, unknown>[] = [
    ...(hideEmployee
      ? []
      : [
          {
            accessorKey: "employee",
            header: "Employee",
            cell: ({ row }) => <EmployeeCell name={row.original.employee} code={row.original.code} />,
          } as ColumnDef<LeaveRow, unknown>,
        ]),
    {
      accessorKey: "leaveType",
      header: "Leave type",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.leaveType}
          {!row.original.isPaid && <span className="ml-1.5 text-xs text-muted-foreground">(unpaid)</span>}
        </span>
      ),
    },
    { accessorKey: "fromDate", header: "From", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.fromDate)}</span> },
    { accessorKey: "toDate", header: "To", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.toDate)}</span> },
    { accessorKey: "days", header: "Days", meta: { align: "right" }, cell: ({ row }) => formatQty(row.original.days) },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => <span className="line-clamp-1 max-w-56 text-muted-foreground">{row.original.reason ?? "—"}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <StatusBadge status={row.original.status} />
          {row.original.decidedBy && row.original.status !== "pending" && <p className="text-xs text-muted-foreground">by {row.original.decidedBy}</p>}
        </div>
      ),
    },
    ...(canDecide ? [{ id: "actions", header: "", cell: ({ row }) => <DecisionButtons row={row.original} /> } as ColumnDef<LeaveRow, unknown>] : []),
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      exportName="leave-requests"
      searchPlaceholder="Search employee, leave type…"
      emptyTitle="No leave requests"
      emptyDescription="Record leave requests here; approving one marks the days as leave in attendance."
      emptyAction={emptyAction}
    />
  );
}
