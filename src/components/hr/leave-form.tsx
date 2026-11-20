"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createLeaveAction } from "@/app/(app)/hr/leave/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatQty, today } from "@/lib/format";
import { workingDaysBetween } from "@/server/services/hr-dates";
import { Field } from "./field";

type LeaveTypeOpt = { id: string; name: string; daysPerYear: number; isPaid: boolean };

export function LeaveForm({
  employees,
  leaveTypes,
  taken,
  defaultEmployeeId,
}: {
  employees: ComboOption[];
  leaveTypes: LeaveTypeOpt[];
  /** "employeeId:typeId" → days already approved this year */
  taken: Record<string, number>;
  defaultEmployeeId?: string | null;
}) {
  const [employeeId, setEmployeeId] = useState<string | null>(defaultEmployeeId ?? null);
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [fromDate, setFrom] = useState(today());
  const [toDate, setTo] = useState(today());
  const [reason, setReason] = useState("");
  const { run, pending, fieldErrors } = useAction();

  const days = fromDate && toDate && toDate >= fromDate ? workingDaysBetween(fromDate, toDate).length : 0;
  const type = leaveTypes.find((t) => t.id === leaveTypeId);
  const used = employeeId && type ? (taken[`${employeeId}:${type.id}`] ?? 0) : 0;
  const left = type && type.daysPerYear > 0 ? type.daysPerYear - used : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => createLeaveAction({ employeeId: employeeId ?? "", leaveTypeId, fromDate, toDate, reason }), {
      success: "Leave request recorded",
      redirectTo: "/hr/leave?status=pending",
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Leave request</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee" error={fieldErrors.employeeId}>
            <Combobox options={employees} value={employeeId} onChange={setEmployeeId} placeholder="Choose employee…" />
          </Field>
          <Field
            label="Leave type"
            error={fieldErrors.leaveTypeId}
            hint={
              type &&
              (left !== null ? (
                <span className={cn(left - days < 0 && "text-destructive")}>
                  {formatQty(used)} of {formatQty(type.daysPerYear)} days used this year · {formatQty(left)} left
                </span>
              ) : type.isPaid ? (
                "Paid leave, no yearly limit"
              ) : (
                "Unpaid: these days are deducted in payroll"
              ))
            }
          >
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {!t.isPaid && " (unpaid)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="From" htmlFor="fromDate" error={fieldErrors.fromDate}>
            <Input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value > toDate) setTo(e.target.value);
              }}
            />
          </Field>
          <Field label="To" htmlFor="toDate" error={fieldErrors.toDate}>
            <Input id="toDate" type="date" value={toDate} min={fromDate} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="rounded-lg bg-muted/50 px-4 py-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Working days (Sundays not counted)</p>
            <p className="tabular text-lg font-semibold">
              {days} day{days === 1 ? "" : "s"}
            </p>
          </div>
          <Field label="Reason" htmlFor="reason" error={fieldErrors.reason} className="sm:col-span-2">
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Optional" />
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/hr/leave">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending || !employeeId || !leaveTypeId || days === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Record request
        </Button>
      </div>
    </form>
  );
}
