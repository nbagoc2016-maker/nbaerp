"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { saveTransfer } from "@/app/(app)/accounting/banking/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney } from "@/lib/format";

type MoneyOption = ComboOption & { balance: number; subtype: string | null };

export function TransferForm({
  accounts,
  defaultDate,
  defaultFrom,
  defaultTo,
  lockDate,
}: {
  accounts: MoneyOption[];
  defaultDate: string;
  defaultFrom?: string | null;
  defaultTo?: string | null;
  lockDate: string | null;
}) {
  const [date, setDate] = useState(defaultDate);
  const [fromId, setFromId] = useState<string | null>(defaultFrom ?? null);
  const [toId, setToId] = useState<string | null>(defaultTo ?? null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const { run, pending, fieldErrors } = useAction();

  const from = accounts.find((a) => a.value === fromId);
  const to = accounts.find((a) => a.value === toId);
  const amt = Number(amount) || 0;
  const physical = from && (from.subtype === "cash" || from.subtype === "petty_cash");
  const short = physical && amt > from.balance;
  const locked = !!lockDate && date <= lockDate;
  const withHint = (opts: MoneyOption[]) => opts.map((o) => ({ ...o, hint: formatMoney(o.balance) }));

  const submit = () =>
    run(
      () => saveTransfer({ date, fromAccountId: fromId!, toAccountId: toId!, amount: amt, reference: reference.trim() || null, notes: notes.trim() || null }),
      { success: (d) => `Transfer ${d.number} posted`, redirectTo: (d) => `/accounting/banking/transfers/${d.id}` }
    );

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Move money</CardTitle>
          <CardDescription>Deposits of cash into the bank, withdrawals, and transfers between your own accounts. Totals don’t change, so this isn’t income or expense.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
          <div className="space-y-2">
            <Label>From</Label>
            <Combobox options={withHint(accounts.filter((a) => a.value !== toId))} value={fromId} onChange={setFromId} placeholder="Account the money leaves" />
            {from && <p className="text-xs text-muted-foreground">Balance {formatMoney(from.balance, { fixed: true })}</p>}
            {fieldErrors.fromAccountId && <p className="text-xs text-destructive">{fieldErrors.fromAccountId}</p>}
          </div>
          <ArrowDown className="mx-auto mt-8 size-5 text-muted-foreground md:-rotate-90" />
          <div className="space-y-2">
            <Label>To</Label>
            <Combobox options={withHint(accounts.filter((a) => a.value !== fromId))} value={toId} onChange={setToId} placeholder="Account the money goes into" />
            {to && <p className="text-xs text-muted-foreground">Balance {formatMoney(to.balance, { fixed: true })}</p>}
            {fieldErrors.toAccountId && <p className="text-xs text-destructive">{fieldErrors.toAccountId}</p>}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="bt-amount">Amount</Label>
            <Input id="bt-amount" inputMode="decimal" className="text-right tabular" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {short && <p className="text-xs text-destructive">More than the {formatMoney(from.balance)} in {from.label}.</p>}
            {fieldErrors.amount && <p className="text-xs text-destructive">{fieldErrors.amount}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bt-date">Date</Label>
            <Input id="bt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {locked && <p className="text-xs text-destructive">Books are closed up to {formatDate(lockDate)}.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bt-ref">Reference</Label>
            <Input id="bt-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / slip / transaction ID" />
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="bt-notes">Notes</Label>
            <Textarea id="bt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>
      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <Button variant="outline" asChild>
          <Link href="/accounting/banking">Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={pending || !fromId || !toId || fromId === toId || amt <= 0 || !!short || locked}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Post transfer
        </Button>
      </div>
    </div>
  );
}
