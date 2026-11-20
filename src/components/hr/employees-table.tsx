"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EmployeeRow } from "@/server/queries/hr";
import { EmployeeCell } from "./employee-avatar";

const columns: ColumnDef<EmployeeRow, unknown>[] = [
  { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="text-muted-foreground">{row.original.code}</span> },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <EmployeeCell name={row.original.name} sub={row.original.phone ?? row.original.code} />,
  },
  { accessorKey: "department", header: "Department", cell: ({ row }) => row.original.department ?? <span className="text-muted-foreground">—</span> },
  { accessorKey: "designation", header: "Designation", cell: ({ row }) => row.original.designation ?? <span className="text-muted-foreground">—</span> },
  { accessorKey: "gross", header: "Gross salary", meta: { align: "right" }, cell: ({ row }) => <Money value={row.original.gross} /> },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  {
    accessorKey: "advanceBalance",
    header: "Advance due",
    meta: { align: "right" },
    cell: ({ row }) => <Money value={row.original.advanceBalance} muteZero />,
  },
];

export function EmployeesTable({ data, departments, canManage }: { data: EmployeeRow[]; departments: { id: string; name: string }[]; canManage: boolean }) {
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("current");
  const rows = useMemo(
    () =>
      data.filter(
        (e) =>
          (dept === "all" || (dept === "none" ? !e.departmentId : e.departmentId === dept)) &&
          (status === "all" || (status === "current" ? e.status === "active" || e.status === "on_leave" : e.status === status))
      ),
    [data, dept, status]
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search name, code, designation…"
      exportName="employees"
      rowHref={(r) => `/hr/employees/${r.id}`}
      emptyTitle={data.length ? "No employees match these filters" : "No employees yet"}
      emptyDescription={
        data.length ? "Try another department or status." : "Add your staff to track attendance, leave, advances and run monthly payroll."
      }
      emptyAction={
        !data.length && canManage ? (
          <Button asChild size="sm">
            <Link href="/hr/employees/new">
              <UserPlus className="size-4" />
              Add employee
            </Link>
          </Button>
        ) : undefined
      }
      toolbar={
        <>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 w-44" aria-label="Department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
              <SelectItem value="none">No department</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-36" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current staff</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_leave">On leave</SelectItem>
              <SelectItem value="resigned">Resigned</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    />
  );
}
