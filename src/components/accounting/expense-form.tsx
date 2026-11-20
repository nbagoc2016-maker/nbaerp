"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { saveExpense } from "@/app/(app)/accounting/expenses/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, round2 } from "@/lib/format";

type MoneyOption = ComboOption & { balance: number; subtype: string | null };

export function ExpenseForm({
  expenseAccounts,
  paidFromAccounts,
  suppliers,
  defaultDate,
  lockDate,
}: {
  expenseAccounts: ComboOption[];
  paidFromAccounts: MoneyOption[];
  suppliers: ComboOption[];
  defaultDate: string;
  lockDate: string | null;
}) {
  const [date, setDate] = useState(defaultDate);
  const [expenseAccountId, setExpenseAccountId] = useState<string | null>(null);
  const [paidFromId, setPaidFromId] = useState<string | null>(paidFromAccounts.find((a) => a.subtype === "cash")?.value ?? null);
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [payee, setPayee] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const { run, pending, fieldErrors } = useAction();

  const amt = round2(Number(amount) || 0);
  const taxAmt = round2(Number(tax) || 0);
  const total = round2(amt + taxAmt);
  const paidFrom = paidFromAccounts.find((a) => a.value === paidFromId);
  const physical = paidFrom && (paidFrom.subtype === "cash" || paidFrom.subtype === "petty_cash");
  const short = physical && total > paidFrom.balance;
  const locked = !!lockDate && date <= lockDate;

  const submit = () =>
    run(
      () =>
        saveExpense({
          date,
          expenseAccountId: expenseAccountId!,
          paidFromAccountId: paidFromId!,
          amount: amt,
          taxAmount: taxAmt,
          payee: payee.trim() || null,
          supplierId,
          description: description.trim(),
          reference: reference.trim() || null,
        }),
      { success: (d) => `Expense ${d.number} recorded`, redirectTo: (d) => `/accounting/expenses/${d.id}` }
    );

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>What was paid</CardTitle>
          <CardDescription>For bills you pay on credit, record a supplier bill in Purchasing instead.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label>Expense category</Label>
            <Combobox options={expenseAccounts} value={expenseAccountId} onChange={setExpenseAccountId} placeholder="e.g. Rent, Electricity, Fuel" searchPlaceholder="Search accounts…" />
            {fieldErrors.expenseAccountId && <p className="text-xs text-destructive">{fieldErrors.expenseAccountId}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-date">Date</Label>
            <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {locked && <p className="text-xs text-destructive">Books are closed up to {formatDate(lockDate)}.</p>}
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="exp-desc">Description</Label>
            <Textarea id="exp-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="e.g. Shop electricity bill for October" />
            {fieldErrors.description && <p className="text-xs text-destructive">{fieldErrors.description}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-payee">Paid to</Label>
            <Input id="exp-payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. LESCO" />
          </div>
          <div className="space-y-2">
            <Label>Supplier (optional)</Label>
            <Combobox options={suppliers} value={supplierId} onChange={setSupplierId} placeholder="Link to a supplier" allowClear />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-ref">Reference</Label>
            <Input id="exp-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bill / receipt no." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
          <CardDescription>Input tax you can claim back goes to Input Sales Tax (1600), not the expense.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Label>Paid from</Label>
            <Combobox options={paidFromAccounts.map((a) => ({ ...a, hint: formatMoney(a.balance) }))} value={paidFromId} onChange={setPaidFromId} placeholder="Cash, bank or petty cash" />
            {fieldErrors.paidFromAccountId && <p className="text-xs text-destructive">{fieldErrors.paidFromAccountId}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="exp-amount">Amount (before tax)</Label>
            <Input id="exp-amount" inputMode="decimal" className="text-right tabular" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {fieldErrors.amount && <p className="text-xs text-destructive">{fieldErrors.amount}</p>}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="exp-tax">Input tax (optional)</Label>
              {amt > 0 && (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTax(String(round2(amt * 0.18)))}>
                  18%
                </button>
              )}
            </div>
            <Input id="exp-tax" inputMode="decimal" className="text-right tabular" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label>Total paid</Label>
            <div className="flex h-9 items-center justify-end rounded-md border bg-muted/40 px-3 font-semibold tabular">{formatMoney(total, { fixed: true })}</div>
            {short && <p className="text-xs text-destructive">More than the {formatMoney(paidFrom.balance)} in {paidFrom.label}.</p>}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <Button variant="outline" asChild>
          <Link href="/accounting/expenses">Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={pending || !expenseAccountId || !paidFromId || amt <= 0 || !description.trim() || !!short || locked}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Record expense
        </Button>
      </div>
    </div>
  );
}
