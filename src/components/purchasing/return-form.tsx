"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { formatMoney, formatQty, round2 } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { EmptyState } from "@/components/app/empty-state";
import { useAction } from "@/components/app/use-action";
import { saveAndPostPurchaseReturn, savePurchaseReturnAction } from "@/app/(app)/purchasing/returns/actions";
import { Field, FormActions } from "./field";

export interface ReturnLineOption {
  billLineId: string;
  description: string;
  sku: string | null;
  unit: string | null;
  billedQty: number;
  returnedQty: number;
  returnable: number;
  unitCost: number;
  taxPerUnit: number;
  trackBatches: boolean;
  isStock: boolean;
  rolls: { id: string; batchNo: string; qty: number }[];
}

export interface ReturnFormValue {
  id?: string | null;
  billId: string | null;
  billLabel?: string | null;
  date: string;
  reason: string;
  /** billLineId -> qty / roll */
  qty: Record<string, number>;
  batch: Record<string, string | null>;
}

const num = (v: string) => (v === "" ? 0 : Number(v));

export function ReturnForm({
  initial,
  lines,
  bills,
  canPost,
}: {
  initial: ReturnFormValue;
  lines: ReturnLineOption[];
  bills: ComboOption[];
  canPost: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const { run, pending, fieldErrors } = useAction();

  const amount = (l: ReturnLineOption) => {
    const q = v.qty[l.billLineId] ?? 0;
    return round2(round2(l.unitCost * q) + round2(l.taxPerUnit * q));
  };
  const total = round2(lines.reduce((t, l) => t + amount(l), 0));

  const payload = () => ({
    id: v.id ?? null,
    date: v.date,
    billId: v.billId ?? "",
    reason: v.reason,
    lines: lines.map((l) => ({ billLineId: l.billLineId, qty: v.qty[l.billLineId] ?? 0, batchId: v.batch[l.billLineId] ?? null })),
  });
  const save = (post: boolean) =>
    run(() => (post ? saveAndPostPurchaseReturn(payload()) : savePurchaseReturnAction(payload())), {
      success: post ? "Return posted" : "Draft saved",
      redirectTo: (d) => `/purchasing/returns/${d.id}`,
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Return</CardTitle>
          <CardDescription>Goods go back against the supplier&apos;s bill, at the price you were billed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier bill" required className="sm:col-span-2">
            {v.id ? (
              <Input value={v.billLabel ?? ""} readOnly className="bg-muted/40" />
            ) : (
              <Combobox
                options={bills}
                value={v.billId}
                onChange={(id) => router.push(id ? `/purchasing/returns/new?bill=${id}` : "/purchasing/returns/new")}
                placeholder="Choose the bill being returned against…"
                searchPlaceholder="Bill number or supplier"
              />
            )}
          </Field>
          <Field label="Return date" htmlFor="date" error={fieldErrors.date} required>
            <Input id="date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
          <Field label="Reason" htmlFor="reason" className="sm:col-span-2 lg:col-span-4">
            <Textarea id="reason" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} rows={2} placeholder="Damaged, wrong shade, short length…" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items to return</CardTitle>
          <CardDescription>Enter how much of each line goes back. Roll items need the roll that is being returned.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!v.billId ? (
            <EmptyState title="Choose a bill" description="Its lines will appear here with the quantity that can still be returned." />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Billed</th>
                    <th className="px-3 py-2 text-right">Returnable</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="w-32 px-3 py-2 text-right">Return qty</th>
                    <th className="w-48 px-3 py-2 text-left">Roll / lot</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const q = v.qty[l.billLineId] ?? 0;
                    const roll = l.rolls.find((r) => r.id === v.batch[l.billLineId]);
                    const tooMuch = q > l.returnable + 0.0005 || (roll && q > roll.qty + 0.0005);
                    return (
                      <tr key={l.billLineId} className="border-t align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium">{l.description}</p>
                          {l.sku && <p className="text-xs text-muted-foreground">{l.sku}</p>}
                        </td>
                        <td className="px-3 py-2 text-right tabular">
                          {formatQty(l.billedQty)} {l.unit}
                        </td>
                        <td className="px-3 py-2 text-right tabular">{formatQty(l.returnable)}</td>
                        <td className="px-3 py-2 text-right tabular">{formatMoney(l.unitCost)}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={l.returnable}
                            step="0.001"
                            value={q || ""}
                            disabled={l.returnable <= 0}
                            onChange={(e) => setV({ ...v, qty: { ...v.qty, [l.billLineId]: num(e.target.value) } })}
                            className={tooMuch ? "h-8 border-destructive text-right tabular" : "h-8 text-right tabular"}
                            aria-label={`Return quantity for ${l.description}`}
                          />
                          {tooMuch && <p className="mt-1 text-right text-[11px] text-destructive">More than can be returned</p>}
                        </td>
                        <td className="px-3 py-2">
                          {l.trackBatches && l.isStock ? (
                            l.rolls.length ? (
                              <Select value={v.batch[l.billLineId] ?? ""} onValueChange={(id) => setV({ ...v, batch: { ...v.batch, [l.billLineId]: id } })}>
                                <SelectTrigger className="h-8 w-full text-xs">
                                  <SelectValue placeholder="Choose roll…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {l.rolls.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      {r.batchNo} · {formatQty(r.qty)} {l.unit}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-destructive">No rolls left in stock</span>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">{l.isStock ? "—" : "Not a stock item"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular">{formatMoney(amount(l))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {fieldErrors.lines && <p className="text-sm text-destructive">{fieldErrors.lines}</p>}
          <div className="ml-auto w-full rounded-xl border bg-muted/30 p-4 text-sm sm:w-80">
            <div className="flex justify-between font-semibold">
              <span>Return value (incl. tax)</span>
              <span className="tabular">{formatMoney(total)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Reduces what you owe the supplier</p>
          </div>
        </CardContent>
      </Card>

      <FormActions>
        <Button type="button" variant="outline" asChild>
          <Link href={v.id ? `/purchasing/returns/${v.id}` : "/purchasing/returns"}>Cancel</Link>
        </Button>
        <Button type="submit" variant={canPost ? "outline" : "default"} disabled={pending || !v.billId || total <= 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save draft
        </Button>
        {canPost && (
          <Button type="button" disabled={pending || !v.billId || total <= 0} onClick={() => save(true)}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save & post
          </Button>
        )}
      </FormActions>
    </form>
  );
}
