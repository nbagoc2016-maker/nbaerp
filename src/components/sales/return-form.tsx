"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createReturnAction } from "@/app/(app)/sales/returns/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney, formatQty, round2, round3 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { returnLineValue } from "@/server/services/sales-schemas";
import { Field, FormActionBar } from "./common";

export interface ReturnableLine {
  id: string;
  description: string;
  sku: string | null;
  unit: string | null;
  allowFraction: boolean;
  qty: number;
  returnedQty: number;
  unitPrice: number;
  taxAmount: number;
  lineTotal: number;
}

/** Pick an invoice (navigates with ?invoice=) for the return form. */
export function InvoicePicker({ invoices, value }: { invoices: ComboOption[]; value?: string | null }) {
  const router = useRouter();
  return (
    <Combobox
      options={invoices}
      value={value}
      onChange={(id) => id && router.push(`/sales/returns/new?invoice=${id}`)}
      placeholder="Find the invoice being returned…"
      searchPlaceholder="Invoice number or customer"
    />
  );
}

export function ReturnForm({
  invoice,
  lines,
  accounts,
  today,
  canPost,
}: {
  invoice: { id: string; number: string; date: string; customerName: string; walkIn: boolean; paymentStatus: string; outstanding: number };
  lines: ReturnableLine[];
  accounts: ComboOption[];
  today: string;
  canPost: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [date, setDate] = useState(today);
  const [settlement, setSettlement] = useState<"credit" | "refund">(invoice.walkIn || invoice.paymentStatus === "paid" ? "refund" : "credit");
  const [refundAccountId, setRefundAccountId] = useState<string | null>(accounts[0]?.value ?? null);
  const [reason, setReason] = useState("");
  const { run, pending, fieldErrors } = useAction();

  const values = lines.map((l) => returnLineValue(l, qty[l.id] ?? 0));
  const total = round2(values.reduce((s, v) => s + v.total, 0));
  const tax = round2(values.reduce((s, v) => s + v.tax, 0));
  const refundBlocked = settlement === "refund" && invoice.paymentStatus === "unpaid";
  const creditBlocked = settlement === "credit" && invoice.walkIn && total > invoice.outstanding + 0.005;

  const submit = (post: boolean) =>
    run(
      () =>
        createReturnAction({
          invoiceId: invoice.id,
          date,
          settlement,
          refundAccountId: settlement === "refund" ? refundAccountId : null,
          reason,
          lines: lines.map((l) => ({ invoiceLineId: l.id, qty: qty[l.id] ?? 0 })).filter((l) => l.qty > 0),
          post,
        }),
      { success: (d) => `Return ${d.number} ${post ? "posted" : "saved as draft"}`, redirectTo: (d) => `/sales/returns/${d.id}` }
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Items coming back</CardTitle>
          <CardDescription>
            From{" "}
            <Link href={`/sales/invoices/${invoice.id}`} className="font-medium text-primary hover:underline">
              {invoice.number}
            </Link>{" "}
            · {invoice.customerName} · {formatDate(invoice.date)}. Amounts follow what was charged, including discounts and tax.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Sold</th>
                  <th className="px-3 py-2 text-right">Already returned</th>
                  <th className="w-36 px-3 py-2 text-right">Return now</th>
                  <th className="px-3 py-2 text-right">Credit value</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const available = round3(l.qty - l.returnedQty);
                  return (
                    <tr key={l.id} className={cn("border-t", available <= 0 && "text-muted-foreground")}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{l.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.sku ? `${l.sku} · ` : ""}
                          {formatMoney(l.unitPrice)} / {l.unit ?? "unit"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {formatQty(l.qty)} {l.unit}
                      </td>
                      <td className="px-3 py-2 text-right tabular">{formatQty(l.returnedQty)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={available}
                            step={l.allowFraction ? 0.01 : 1}
                            disabled={available <= 0}
                            value={qty[l.id] || ""}
                            placeholder="0"
                            onChange={(e) => setQty((p) => ({ ...p, [l.id]: Math.min(available, Math.max(0, round3(Number(e.target.value) || 0))) }))}
                            className="h-8 w-24 text-right tabular"
                          />
                          <Button type="button" variant="ghost" size="xs" disabled={available <= 0} onClick={() => setQty((p) => ({ ...p, [l.id]: available }))}>
                            All
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular">{values[i].total ? formatMoney(values[i].total) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right text-muted-foreground">
                    {tax > 0 && <>Includes tax {formatMoney(tax)} · </>}Total
                  </td>
                  <td className="px-3 py-2.5 text-right text-base font-semibold tabular">{formatMoney(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settlement</CardTitle>
          <CardDescription>Credit reduces what the customer owes; a refund pays the money back now.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <Field label="How is it settled?" className="lg:col-span-1">
            <RadioGroup value={settlement} onValueChange={(v) => setSettlement(v as "credit" | "refund")} className="gap-2">
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", settlement === "credit" && "border-primary bg-primary/5")}>
                <RadioGroupItem value="credit" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Credit to account</span>
                  <span className="block text-xs text-muted-foreground">Reduce the balance owed on this invoice / account</span>
                </span>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", settlement === "refund" && "border-primary bg-primary/5")}>
                <RadioGroupItem value="refund" className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Refund money</span>
                  <span className="block text-xs text-muted-foreground">Pay back from cash or bank</span>
                </span>
              </label>
            </RadioGroup>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            <Field label="Return date" htmlFor="date" required error={fieldErrors.date}>
              <Input id="date" type="date" value={date} min={invoice.date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {settlement === "refund" && (
              <Field label="Refund paid from" required error={fieldErrors.refundAccountId}>
                <Combobox options={accounts} value={refundAccountId} onChange={setRefundAccountId} placeholder="Cash or bank account…" />
              </Field>
            )}
            <Field label="Reason" htmlFor="reason" className="sm:col-span-2">
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Wrong size, colour mismatch, damaged" />
            </Field>
            {refundBlocked && <p className="text-sm text-destructive sm:col-span-2">This invoice hasn&apos;t been paid yet, so use a credit instead of a refund.</p>}
            {creditBlocked && (
              <p className="text-sm text-destructive sm:col-span-2">
                Walk-in sales can only be credited up to what&apos;s still unpaid ({formatMoney(invoice.outstanding)}). Refund the rest.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <FormActionBar>
        <p className="mr-auto text-sm text-muted-foreground">
          {settlement === "refund" ? "Refund" : "Credit"} <span className="tabular text-base font-semibold text-foreground">{formatMoney(total)}</span>
        </p>
        <Button type="button" variant="outline" asChild>
          <Link href={`/sales/invoices/${invoice.id}`}>Cancel</Link>
        </Button>
        <Button type="button" variant="outline" disabled={pending || total <= 0} onClick={() => submit(false)}>
          Save draft
        </Button>
        {canPost && (
          <Button type="button" disabled={pending || total <= 0 || refundBlocked || creditBlocked || (settlement === "refund" && !refundAccountId)} onClick={() => submit(true)}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Post return
          </Button>
        )}
      </FormActionBar>
    </div>
  );
}
