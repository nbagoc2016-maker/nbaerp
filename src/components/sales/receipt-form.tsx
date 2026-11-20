"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Info, Loader2, Wand2 } from "lucide-react";
import { createReceiptAction } from "@/app/(app)/sales/receipts/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fifoAllocate, RECEIPT_METHODS, WALK_IN } from "@/server/services/sales-schemas";
import { Field, FormActionBar, METHOD_LABEL } from "./common";

export interface OpenInvoice {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  customerId: string | null;
  customerName: string;
  total: number;
  outstanding: number;
}

type Method = (typeof RECEIPT_METHODS)[number];

export function ReceiptForm({
  customers,
  balances,
  invoices,
  accounts,
  initialCustomer,
  initialInvoiceId,
  today,
}: {
  customers: ComboOption[];
  balances: Record<string, number>;
  invoices: OpenInvoice[];
  accounts: (ComboOption & { subtype: "cash" | "bank" })[];
  initialCustomer: string | null; // customer id, WALK_IN, or null
  initialInvoiceId?: string | null;
  today: string;
}) {
  const firstOf = (subtype: "cash" | "bank") => accounts.find((a) => a.subtype === subtype)?.value ?? accounts[0]?.value ?? null;
  const initialInv = invoices.find((i) => i.id === initialInvoiceId);
  const [customer, setCustomer] = useState<string | null>(initialCustomer);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState<number>(initialInv?.outstanding ?? 0);
  const [method, setMethod] = useState<Method>("cash");
  const [account, setAccount] = useState<string | null>(firstOf("cash"));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, number>>(initialInv ? { [initialInv.id]: initialInv.outstanding } : {});
  const [manual, setManual] = useState(!!initialInv);
  const { run, pending, fieldErrors } = useAction();

  const customerOptions = useMemo<ComboOption[]>(
    () => [{ value: WALK_IN, label: "Walk-in customer", hint: "Unregistered", keywords: "cash counter" }, ...customers],
    [customers]
  );
  const customerId = customer && customer !== WALK_IN ? customer : null;
  const open = useMemo(() => (customer ? invoices.filter((i) => (i.customerId ?? null) === customerId) : []), [customer, customerId, invoices]);
  const owed = round2(open.reduce((s, i) => s + i.outstanding, 0));
  const allocated = round2(open.reduce((s, i) => s + (alloc[i.id] ?? 0), 0));
  const left = round2(amount - allocated);
  const balance = customerId ? (balances[customerId] ?? 0) : null;

  const autoAllocate = (amt: number, list = open) => setAlloc(fifoAllocate(list, amt));

  const changeCustomer = (v: string | null) => {
    setCustomer(v);
    const id = v && v !== WALK_IN ? v : null;
    const list = v ? invoices.filter((i) => (i.customerId ?? null) === id) : [];
    setManual(false);
    autoAllocate(amount, list);
  };
  const changeAmount = (amt: number) => {
    setAmount(amt);
    if (!manual) autoAllocate(amt);
  };
  const changeMethod = (m: Method) => {
    setMethod(m);
    const want = m === "cash" ? "cash" : "bank";
    if (accounts.find((a) => a.value === account)?.subtype !== want) setAccount(firstOf(want));
  };

  const walkInLeftover = !customerId && customer === WALK_IN && Math.abs(left) > 0.005;
  const overAllocated = left < -0.005;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        createReceiptAction({
          date,
          customerId,
          method,
          depositAccountId: account ?? "",
          amount,
          reference,
          notes,
          allocations: Object.entries(alloc)
            .filter(([id, a]) => a > 0 && open.some((i) => i.id === id))
            .map(([invoiceId, a]) => ({ invoiceId, amount: a })),
        }),
      { success: (d) => `Receipt ${d.number} recorded`, redirectTo: (d) => `/sales/receipts/${d.id}` }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
          <CardDescription>Who paid, how much and where the money went.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Received from" required error={fieldErrors.customerId} className="sm:col-span-2 lg:col-span-1">
            <Combobox options={customerOptions} value={customer} onChange={changeCustomer} placeholder="Select customer…" searchPlaceholder="Name, code or phone" />
            {customer && (
              <p className="text-xs text-muted-foreground">
                {balance !== null && (
                  <>
                    Balance <span className="tabular font-medium text-foreground">{formatMoney(balance)}</span> ·{" "}
                  </>
                )}
                {open.length} open invoice{open.length === 1 ? "" : "s"} · {formatMoney(owed)} due
              </p>
            )}
          </Field>
          <Field label="Date" htmlFor="date" required error={fieldErrors.date}>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount received" htmlFor="amount" required error={fieldErrors.amount}>
            <div className="flex gap-2">
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount || ""}
                onChange={(e) => changeAmount(Number(e.target.value) || 0)}
                className="tabular text-base font-semibold"
              />
              {owed > 0 && (
                <Button type="button" variant="outline" onClick={() => changeAmount(owed)} className="shrink-0">
                  Full {formatMoney(owed)}
                </Button>
              )}
            </div>
          </Field>
          <Field label="Method">
            <Select value={method} onValueChange={(m) => changeMethod(m as Method)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECEIPT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Deposited to" required error={fieldErrors.depositAccountId}>
            <Combobox options={accounts} value={account} onChange={setAccount} placeholder="Cash or bank account…" />
          </Field>
          <Field label="Reference" htmlFor="reference" hint="Cheque no., transfer ID or slip no.">
            <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-3">
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Apply to invoices</CardTitle>
            <CardDescription className="mt-1.5">Oldest invoices are settled first. Change any amount; whatever isn&apos;t applied stays as credit on the customer&apos;s account.</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!open.length}
            onClick={() => {
              setManual(false);
              autoAllocate(amount);
            }}
          >
            <Wand2 className="size-4" />
            Auto-apply oldest first
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!customer ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Pick who paid to see their open invoices.</p>
          ) : open.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No open invoices. {customerId ? "The whole amount will be kept as credit on their account." : "Walk-in payments must be applied to an invoice."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Invoice</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Due</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Outstanding</th>
                    <th className="w-44 px-3 py-2 text-right">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((i) => {
                    const overdue = i.dueDate && i.dueDate < today;
                    return (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-2">
                          <Link href={`/sales/invoices/${i.id}`} className="font-medium text-primary hover:underline" target="_blank">
                            {i.number}
                          </Link>
                          {!customerId && <p className="text-xs text-muted-foreground">{i.customerName}</p>}
                        </td>
                        <td className="px-3 py-2">{formatDate(i.date)}</td>
                        <td className={cn("px-3 py-2", overdue && "text-destructive")}>{i.dueDate ? formatDate(i.dueDate) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular">{formatMoney(i.total)}</td>
                        <td className="px-3 py-2 text-right tabular font-medium">{formatMoney(i.outstanding)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={i.outstanding}
                              step="0.01"
                              value={alloc[i.id] || ""}
                              onChange={(e) => {
                                setManual(true);
                                setAlloc((p) => ({ ...p, [i.id]: Math.min(i.outstanding, Math.max(0, Number(e.target.value) || 0)) }));
                              }}
                              className="h-8 w-28 text-right tabular"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setManual(true);
                                setAlloc((p) => ({ ...p, [i.id]: i.outstanding }));
                              }}
                            >
                              Full
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <dl className="ml-auto grid w-full max-w-sm gap-1.5 rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Amount received</dt>
              <dd className="tabular">{formatMoney(amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Applied to invoices</dt>
              <dd className="tabular">{formatMoney(allocated)}</dd>
            </div>
            <div className={cn("flex justify-between border-t pt-2 font-semibold", (walkInLeftover || overAllocated) && "text-destructive")}>
              <dt>{left < 0 ? "Over-applied" : "Kept as credit on account"}</dt>
              <dd className="tabular">{formatMoney(Math.abs(left))}</dd>
            </div>
          </dl>
          {(walkInLeftover || overAllocated) && (
            <p className="flex items-center justify-end gap-1.5 text-sm text-destructive">
              <Info className="size-4" />
              {overAllocated ? "Applied amounts are more than the payment." : "Walk-in payments can't be kept as credit: apply the full amount or pick a customer."}
            </p>
          )}
        </CardContent>
      </Card>

      <FormActionBar>
        <Button type="button" variant="outline" asChild>
          <Link href="/sales/receipts">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending || !customer || amount <= 0 || !account || walkInLeftover || overAllocated}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Record receipt {amount > 0 && formatMoney(amount)}
        </Button>
      </FormActionBar>
    </form>
  );
}
