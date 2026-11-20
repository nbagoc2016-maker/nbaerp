"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { createPayrollRunAction } from "@/app/(app)/hr/payroll/actions";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { monthLabel } from "@/lib/format";
import { periodEnd, workingDaysBetween, periodStart } from "@/server/services/hr-dates";
import { Field } from "./field";

export function PayrollNewForm({ defaultPeriod, existing }: { defaultPeriod: string; existing: Record<string, string> }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [date, setDate] = useState(periodEnd(defaultPeriod));
  const [dateTouched, setDateTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const { run, pending, fieldErrors } = useAction();
  const valid = /^\d{4}-\d{2}$/.test(period);
  const clash = valid ? existing[period] : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createPayrollRunAction({ period, date, notes }), { success: (d) => `Payroll ${d.number} created`, redirectTo: (d) => `/hr/payroll/${d.id}` });
      }}
      className="space-y-5"
    >
      <Card>
        <CardHeader>
          <CardTitle>Run payroll</CardTitle>
          <CardDescription>
            Creates a draft with one payslip per employee. Absent days, half days and unpaid leave come from attendance; advance installments are
            deducted automatically. You can review and adjust before posting.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Month"
            htmlFor="period"
            error={fieldErrors.period ?? (clash ? `Payroll for ${monthLabel(period)} already exists` : undefined)}
            hint={valid ? `${monthLabel(period)} · ${workingDaysBetween(periodStart(period), periodEnd(period)).length} working days (Sundays off)` : undefined}
          >
            <Input
              id="period"
              type="month"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                if (!dateTouched && /^\d{4}-\d{2}$/.test(e.target.value)) setDate(periodEnd(e.target.value));
              }}
            />
          </Field>
          <Field label="Posting date" htmlFor="date" error={fieldErrors.date} hint="The date salaries are booked in the ledger">
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDateTouched(true);
              }}
            />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/hr/payroll">Cancel</Link>
        </Button>
        {clash ? (
          <Button asChild>
            <Link href={`/hr/payroll/${clash}`}>Open existing payroll</Link>
          </Button>
        ) : (
          <Button type="submit" disabled={pending || !valid}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Calculate payroll
          </Button>
        )}
      </div>
    </form>
  );
}
