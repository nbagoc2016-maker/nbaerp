"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { formatDate, formatMoney, round2, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { EmptyState } from "@/components/app/empty-state";
import { useAction } from "@/components/app/use-action";
import { recordSupplierPaymentAction } from "@/app/(app)/purchasing/payments/actions";
import { allocateOldestFirst, PAYMENT_METHODS } from "@/server/services/purchasing-schemas";
import { Field, FormActions } from "./field";

export interface OpenBill {
  id: string;
  number: string;
  supplierInvoiceNo: string | null;
  supplierId: string;
  date: string;
  dueDate: string | null;
  total: number;
  outstanding: number;
}

const METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = { cash: "Cash", bank: "Bank transfer", cheque: "Cheque", wallet: "Mobile wallet" };
const num = (v: string) => (v === "" ? 0 : Number(v));

export function PaymentForm({
  suppliers,
  accounts,
  bills,
  balances,
  initialSupplierId,
  focusBillId,
}: {
  suppliers: ComboOption[];
  accounts: ComboOption[];
  bills: OpenBill[];
  balances: Record<string, number>;
  initialSupplierId: string | null;
  focusBillId?: string | null;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("bank");
  const [paidFrom, setPaidFrom] = useState<string | null>(accounts.find((a) => a.hint === "1210")?.value ?? accounts[0]?.value ?? null);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const supplierBills = useMemo(() => bills.filter((b) => b.supplierId === supplierId), [bills, supplierId]);
  const focus = supplierBills.find((b) => b.id === focusBillId);
  const [amount, setAmount] = useState(focus?.outstanding ?? 0);
  const [auto, setAuto] = useState(!focus);
  const [manual, setManual] = useState<Record<string, number>>(focus ? { [focus.id]: focus.outstanding } : {});

  const autoAlloc = useMemo(() => Object.fromEntries(allocateOldestFirst(supplierBills, amount).map((a) => [a.billId, a.amount])), [supplierBills, amount]);
  const alloc = auto ? autoAlloc : manual;
  const allocated = round2(supplierBills.reduce((t, b) => t + (alloc[b.id] ?? 0), 0));
  const unallocated = round2(amount - allocated);
  const openTotal = round2(supplierBills.reduce((t, b) => t + b.outstanding, 0));
  const balance = supplierId ? (balances[supplierId] ?? 0) : 0;
  const t = today();

  const changeSupplier = (id: string | null) => {
    setSupplierId(id);
    setManual({});
    setAuto(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        recordSupplierPaymentAction({
          date,
          supplierId: supplierId ?? "",
          method,
          paidFromAccountId: paidFrom ?? "",
          amount,
          reference,
          notes,
          allocations: supplierBills.map((b) => ({ billId: b.id, amount: alloc[b.id] ?? 0 })).filter((a) => a.amount > 0),
        }),
      { success: "Payment recorded", redirectTo: (d) => `/purchasing/payments/${d.id}` }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
          <CardDescription>Dr Accounts Payable (supplier) · Cr the cash or bank account you pay from.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Supplier"
            error={fieldErrors.supplierId}
            required
            className="sm:col-span-2"
            hint={supplierId ? (balance < 0 ? `Advance with supplier: ${formatMoney(-balance)}` : `You owe ${formatMoney(balance)}`) : undefined}
          >
            <Combobox options={suppliers} value={supplierId} onChange={changeSupplier} placeholder="Choose supplier…" searchPlaceholder="Name, code or phone" />
          </Field>
          <Field label="Date" htmlFor="date" error={fieldErrors.date} required>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Method">
            <Select value={method} onValueChange={(m) => setMethod(m as typeof method)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Paid from" error={fieldErrors.paidFromAccountId} required className="sm:col-span-2">
            <Combobox options={accounts} value={paidFrom} onChange={setPaidFrom} placeholder="Cash or bank account…" />
          </Field>
          <Field label="Amount" htmlFor="amount" error={fieldErrors.amount} required>
            <Input id="amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount || ""} onChange={(e) => setAmount(num(e.target.value))} className="text-right tabular" />
          </Field>
          <Field label={method === "cheque" ? "Cheque no" : "Reference"} htmlFor="ref">
            <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "bank" ? "Transfer / transaction ID" : undefined} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Settle bills</CardTitle>
            <CardDescription>Spread the payment over open bills, oldest due first. Anything left over stays as an advance with the supplier.</CardDescription>
          </div>
          {supplierBills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAmount(openTotal)}>
                Pay all open ({formatMoney(openTotal)})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAuto(true);
                  setManual({});
                }}
                disabled={auto}
              >
                <Wand2 className="size-4" />
                Oldest first
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!supplierId ? (
            <EmptyState title="Choose a supplier" description="Their unpaid bills will show here." />
          ) : supplierBills.length === 0 ? (
            <EmptyState title="No unpaid bills" description="The whole payment will be kept as an advance against future bills." />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Bill</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Due</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Outstanding</th>
                    <th className="w-40 px-3 py-2 text-right">Pay now</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierBills.map((b) => {
                    const late = b.dueDate && b.dueDate < t;
                    return (
                      <tr key={b.id} className="border-t">
                        <td className="px-3 py-2">
                          <Link href={`/purchasing/bills/${b.id}`} className="font-medium text-primary hover:underline" target="_blank">
                            {b.number}
                          </Link>
                          {b.supplierInvoiceNo && <span className="block text-xs text-muted-foreground">Inv {b.supplierInvoiceNo}</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(b.date)}</td>
                        <td className={cn("px-3 py-2 whitespace-nowrap", late && "font-medium text-destructive")}>{formatDate(b.dueDate)}</td>
                        <td className="px-3 py-2 text-right tabular">{formatMoney(b.total)}</td>
                        <td className="px-3 py-2 text-right tabular">{formatMoney(b.outstanding)}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={b.outstanding}
                            step="0.01"
                            value={alloc[b.id] || ""}
                            onChange={(e) => {
                              const val = Math.min(num(e.target.value), b.outstanding);
                              setManual({ ...alloc, [b.id]: val });
                              setAuto(false);
                            }}
                            className="h-8 text-right tabular"
                            aria-label={`Amount for ${b.number}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <dl className="ml-auto w-full space-y-1.5 rounded-xl border bg-muted/30 p-4 text-sm sm:w-80">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Payment</dt>
              <dd className="tabular">{formatMoney(amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Allocated to bills</dt>
              <dd className="tabular">{formatMoney(allocated)}</dd>
            </div>
            <div className={cn("flex justify-between border-t pt-2 font-semibold", unallocated < 0 && "text-destructive")}>
              <dt>{unallocated < 0 ? "Over-allocated" : "Kept as advance"}</dt>
              <dd className="tabular">{formatMoney(Math.abs(unallocated))}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </CardContent>
      </Card>

      <FormActions>
        <Button type="button" variant="outline" asChild>
          <Link href="/purchasing/payments">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending || amount <= 0 || unallocated < 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Record payment
        </Button>
      </FormActions>
    </form>
  );
}
