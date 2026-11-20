"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { issueAdvanceAction } from "@/app/(app)/hr/advances/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatMoney, today } from "@/lib/format";
import { Field } from "./field";

export function AdvanceForm({
  employees,
  accounts,
  defaultEmployeeId,
  balances,
}: {
  employees: ComboOption[];
  accounts: ComboOption[];
  defaultEmployeeId?: string | null;
  /** employeeId → open advance balance */
  balances: Record<string, number>;
}) {
  const [employeeId, setEmployeeId] = useState<string | null>(defaultEmployeeId ?? null);
  const [kind, setKind] = useState<"advance" | "loan">("advance");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [installment, setInstallment] = useState("");
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.value ?? null);
  const [reason, setReason] = useState("");
  const { run, pending, fieldErrors } = useAction();

  const amt = Number(amount || 0);
  const inst = Number(installment || 0) > 0 ? Math.min(Number(installment), amt) : amt;
  const months = amt > 0 && inst > 0 ? Math.ceil(amt / inst) : 0;
  const existing = employeeId ? (balances[employeeId] ?? 0) : 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        issueAdvanceAction({
          employeeId: employeeId ?? "",
          date,
          kind,
          amount: amount || 0,
          installmentAmount: installment || 0,
          paidFromAccountId: accountId ?? "",
          reason,
        }),
      { success: (d) => `${kind === "loan" ? "Loan" : "Advance"} ${d.number} paid`, redirectTo: (d) => `/hr/advances/${d.id}` }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Pay an advance or loan</CardTitle>
          <CardDescription>Books Employee Advances (1500) against the cash or bank account it is paid from. Payroll recovers it automatically.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee" error={fieldErrors.employeeId} hint={existing > 0 ? `Already owes ${formatMoney(existing)} on earlier advances` : undefined}>
            <Combobox options={employees} value={employeeId} onChange={setEmployeeId} placeholder="Choose employee…" />
          </Field>
          <Field label="Type">
            <div className="inline-flex h-9 w-full rounded-md border p-0.5">
              {(["advance", "loan"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn("flex-1 rounded-[5px] text-sm font-medium text-muted-foreground", kind === k && "bg-primary text-primary-foreground")}
                >
                  {k === "advance" ? "Salary advance" : "Staff loan"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Date" htmlFor="date" error={fieldErrors.date}>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Paid from" error={fieldErrors.paidFromAccountId}>
            <Combobox options={accounts} value={accountId} onChange={setAccountId} placeholder="Cash or bank account…" />
          </Field>
          <Field label="Amount" htmlFor="amount" error={fieldErrors.amount}>
            <Input id="amount" type="number" min={0} step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular text-right" />
          </Field>
          <Field
            label="Recover per payroll"
            htmlFor="installment"
            error={fieldErrors.installmentAmount}
            hint={amt > 0 ? (months <= 1 ? "Recovered in full from the next salary" : `About ${months} monthly installments of ${formatMoney(inst)}`) : "Leave blank to recover it all from the next salary"}
          >
            <Input
              id="installment"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={installment}
              onChange={(e) => setInstallment(e.target.value)}
              placeholder={kind === "loan" ? "e.g. 5000" : "Full amount"}
              className="tabular text-right"
            />
          </Field>
          <Field label="Reason" htmlFor="reason" className="sm:col-span-2">
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Optional, e.g. medical emergency" />
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/hr/advances">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending || !employeeId || !accountId || amt <= 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Pay {amt > 0 ? formatMoney(amt) : ""}
        </Button>
      </div>
    </form>
  );
}
