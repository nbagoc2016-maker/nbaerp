"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { saveVoucher } from "@/app/(app)/accounting/petty-cash/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface VoucherFund {
  id: string;
  name: string;
  balance: number;
  floatAmount: number;
  custodianName: string | null;
}

type Kind = "expense" | "topup";

export function VoucherForm({
  funds,
  expenseAccounts,
  sourceAccounts,
  defaultDate,
  defaults,
  lockDate,
}: {
  funds: VoucherFund[];
  expenseAccounts: ComboOption[];
  sourceAccounts: (ComboOption & { balance: number; subtype: string | null })[];
  defaultDate: string;
  defaults: { fundId?: string | null; type?: Kind; amount?: number | null };
  lockDate: string | null;
}) {
  const [fundId, setFundId] = useState<string | null>(defaults.fundId ?? funds[0]?.id ?? null);
  const [type, setType] = useState<Kind>(defaults.type ?? "expense");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState(defaults.amount ? String(defaults.amount) : "");
  const [date, setDate] = useState(defaultDate);
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState(defaults.type === "topup" ? "Top-up to float" : "");
  const [receiptRef, setReceiptRef] = useState("");
  const { run, pending, fieldErrors } = useAction();

  const fund = funds.find((f) => f.id === fundId);
  const amt = round2(Number(amount) || 0);
  const overspend = type === "expense" && !!fund && amt > fund.balance;
  const source = sourceAccounts.find((a) => a.value === accountId);
  const sourceShort = type === "topup" && source?.subtype === "cash" && amt > source.balance;
  const replenish = fund ? Math.max(0, round2(fund.floatAmount - fund.balance)) : 0;
  const locked = !!lockDate && date <= lockDate;

  const switchType = (t: Kind) => {
    setType(t);
    setAccountId(null);
    if (t === "topup" && !amount && replenish > 0) setAmount(String(replenish));
    if (t === "topup" && !description) setDescription("Top-up to float");
  };

  const submit = () =>
    run(
      () =>
        saveVoucher({
          fundId: fundId!,
          date,
          type,
          accountId: accountId!,
          amount: amt,
          payee: payee.trim() || null,
          description: description.trim(),
          receiptRef: receiptRef.trim() || null,
        }),
      { success: (d) => `Voucher ${d.number} posted`, redirectTo: (d) => `/accounting/petty-cash/${d.id}` }
    );

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Fund</CardTitle>
          <CardDescription>Expense vouchers spend from the fund; top-ups refill it from cash or bank.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Petty cash fund</Label>
            <Select value={fundId ?? undefined} onValueChange={setFundId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a fund" />
              </SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Voucher type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "topup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                    type === t && "border-primary bg-primary/5 ring-1 ring-primary"
                  )}
                >
                  {t === "expense" ? <Minus className="size-4 text-destructive" /> : <Plus className="size-4 text-success" />}
                  <span>
                    <span className="block font-medium">{t === "expense" ? "Expense" : "Top-up"}</span>
                    <span className="block text-xs text-muted-foreground">{t === "expense" ? "Money paid out of the fund" : "Money put into the fund"}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {fund && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-muted/40 p-3 text-sm sm:col-span-3">
              <span>
                Balance <strong className="tabular">{formatMoney(fund.balance, { fixed: true })}</strong>
              </span>
              <span>
                Float <strong className="tabular">{formatMoney(fund.floatAmount, { fixed: true })}</strong>
              </span>
              <span>
                To replenish <strong className="tabular">{formatMoney(replenish, { fixed: true })}</strong>
              </span>
              {fund.custodianName && <span className="text-muted-foreground">Custodian: {fund.custodianName}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{type === "expense" ? "Expense details" : "Top-up details"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label>{type === "expense" ? "Expense account" : "Take money from"}</Label>
            <Combobox
              key={type}
              options={type === "expense" ? expenseAccounts : sourceAccounts.map((a) => ({ ...a, hint: formatMoney(a.balance) }))}
              value={accountId}
              onChange={setAccountId}
              placeholder={type === "expense" ? "e.g. Tea, Meals & Entertainment" : "Cash or bank account"}
            />
            {fieldErrors.accountId && <p className="text-xs text-destructive">{fieldErrors.accountId}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pcv-amount">Amount</Label>
            <Input id="pcv-amount" inputMode="decimal" className="text-right tabular" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {overspend && <p className="text-xs text-destructive">More than the {formatMoney(fund!.balance)} in the fund. Top it up first.</p>}
            {sourceShort && <p className="text-xs text-destructive">More than the {formatMoney(source!.balance)} in {source!.label}.</p>}
            {type === "topup" && replenish > 0 && amt !== replenish && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAmount(String(replenish))}>
                Use replenish amount {formatMoney(replenish)}
              </button>
            )}
            {fieldErrors.amount && <p className="text-xs text-destructive">{fieldErrors.amount}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pcv-date">Date</Label>
            <Input id="pcv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {locked && <p className="text-xs text-destructive">Books are closed up to {formatDate(lockDate)}.</p>}
          </div>
          {type === "expense" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="pcv-payee">Paid to</Label>
                <Input id="pcv-payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. Rickshaw driver" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pcv-receipt">Receipt / bill no.</Label>
                <Input id="pcv-receipt" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="pcv-desc">Description</Label>
            <Textarea id="pcv-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={type === "expense" ? "What was the money spent on?" : ""} />
            {fieldErrors.description && <p className="text-xs text-destructive">{fieldErrors.description}</p>}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <Button variant="outline" asChild>
          <Link href="/accounting/petty-cash">Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={pending || !fundId || !accountId || amt <= 0 || !description.trim() || overspend || sourceShort || locked}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Post voucher
        </Button>
      </div>
    </div>
  );
}
