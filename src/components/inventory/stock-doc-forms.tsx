"use client";

// Create / edit forms for stock transfers and stock adjustments.
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Plus, ScanBarcode, Send, Trash2 } from "lucide-react";
import { Combobox } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatQty, round3 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveAdjustmentAction, saveAndPostAdjustmentAction } from "@/app/(app)/inventory/adjustments/actions";
import { saveAndPostTransferAction, saveTransferAction } from "@/app/(app)/inventory/transfers/actions";
import { ADJUSTMENT_REASON_LABELS, Field } from "./shared";

export interface PickerData {
  products: { id: string; sku: string; name: string; barcode: string | null; unit: string; allowFraction: boolean; trackBatches: boolean }[];
  /** productId → warehouseId → qty / avg cost (avgCost null without cost access) */
  balance: Record<string, Record<string, { qty: number; avgCost: number | null }>>;
  batches: { id: string; productId: string; warehouseId: string; batchNo: string; qty: number; shade: string | null }[];
  warehouses: { value: string; label: string; hint?: string; isDefault?: boolean }[];
}

const NONE = "__none__";
const num = (v: string) => (v === "" ? 0 : Number(v));
const newKey = () => crypto.randomUUID();

function useProductOptions(data: PickerData, warehouseId: string) {
  return useMemo(
    () =>
      data.products.map((p) => ({
        value: p.id,
        label: p.name,
        hint: `${p.sku} · ${formatQty(data.balance[p.id]?.[warehouseId]?.qty ?? 0)} ${p.unit}`,
        keywords: `${p.sku} ${p.barcode ?? ""}`,
      })),
    [data, warehouseId]
  );
}

function ScanBox({ data, onPick }: { data: PickerData; onPick: (productId: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="relative w-full max-w-xs">
      <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={ref}
        placeholder="Scan barcode or type SKU + Enter"
        className="h-9 pl-8"
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const code = e.currentTarget.value.trim().toLowerCase();
          const p = data.products.find((x) => x.barcode?.toLowerCase() === code || x.sku.toLowerCase() === code);
          if (p) {
            onPick(p.id);
            e.currentTarget.value = "";
          } else e.currentTarget.select();
        }}
      />
    </div>
  );
}

function ActionBar({ cancelHref, pending, onDraft, onPost, postLabel, canSubmit }: { cancelHref: string; pending: boolean; onDraft: () => void; onPost: () => void; postLabel: string; canSubmit: boolean }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <Button type="button" variant="outline" asChild>
        <Link href={cancelHref}>Cancel</Link>
      </Button>
      <Button type="button" variant="secondary" disabled={pending || !canSubmit} onClick={onDraft}>
        Save draft
      </Button>
      <Button type="button" disabled={pending || !canSubmit} onClick={onPost}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {postLabel}
      </Button>
    </div>
  );
}

// ---- Transfer --------------------------------------------------------------------------------

export interface TransferFormValue {
  id?: string | null;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  notes: string;
  lines: { productId: string | null; batchId: string | null; qty: number }[];
}

export function TransferForm({ initial, data }: { initial: TransferFormValue; data: PickerData }) {
  const [v, setV] = useState(initial);
  const [lines, setLines] = useState(() => (initial.lines.length ? initial.lines : [{ productId: null, batchId: null, qty: 0 }]).map((l) => ({ ...l, key: newKey() })));
  const { run, pending, fieldErrors } = useAction();
  const byId = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const options = useProductOptions(data, v.fromWarehouseId);

  const update = (key: string, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addProduct = (productId: string) =>
    setLines((ls) => {
      const blank = ls.find((l) => !l.productId);
      if (blank) return ls.map((l) => (l.key === blank.key ? { ...l, productId, batchId: null, qty: 1 } : l));
      return [...ls, { key: newKey(), productId, batchId: null, qty: 1 }];
    });

  // Requested qty per product (and per roll) vs what the source warehouse holds
  const requested = new Map<string, number>();
  for (const l of lines) if (l.productId) requested.set(l.productId, (requested.get(l.productId) ?? 0) + l.qty);

  const payload = () => ({
    id: v.id ?? null,
    date: v.date,
    fromWarehouseId: v.fromWarehouseId,
    toWarehouseId: v.toWarehouseId,
    notes: v.notes,
    lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId!, batchId: l.batchId, qty: l.qty })),
  });
  const valid = v.fromWarehouseId && v.toWarehouseId && v.fromWarehouseId !== v.toWarehouseId && lines.some((l) => l.productId && l.qty > 0);
  const totalQty = lines.reduce((t, l) => t + (l.productId ? l.qty : 0), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Transfer details</CardTitle>
          <CardDescription>Stock moves at its average cost, so the total value of your inventory doesn&apos;t change.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_12rem]">
          <Field label="From warehouse" error={fieldErrors.fromWarehouseId}>
            <Select value={v.fromWarehouseId} onValueChange={(w) => { setV({ ...v, fromWarehouseId: w }); setLines((ls) => ls.map((l) => ({ ...l, batchId: null }))); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {data.warehouses.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ArrowRight className="mt-8 hidden size-5 text-muted-foreground lg:block" />
          <Field label="To warehouse" error={fieldErrors.toWarehouseId ?? (v.toWarehouseId && v.toWarehouseId === v.fromWarehouseId ? "Choose a different warehouse" : undefined)}>
            <Select value={v.toWarehouseId} onValueChange={(w) => setV({ ...v, toWarehouseId: w })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Destination" />
              </SelectTrigger>
              <SelectContent>
                {data.warehouses.map((w) => (
                  <SelectItem key={w.value} value={w.value} disabled={w.value === v.fromWarehouseId}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date" htmlFor="date" error={fieldErrors.date}>
            <Input id="date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-4">
            <Textarea id="notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Vehicle, driver, reason…" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Available quantities are for the source warehouse.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScanBox data={data} onPick={addProduct} />
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="w-56 px-2 py-2 text-left">Roll / batch</th>
                  <th className="w-28 px-2 py-2 text-right">Available</th>
                  <th className="w-36 px-2 py-2 text-right">Qty to move</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const p = l.productId ? byId.get(l.productId) : undefined;
                  const available = p ? (data.balance[p.id]?.[v.fromWarehouseId]?.qty ?? 0) : 0;
                  const rolls = p ? data.batches.filter((b) => b.productId === p.id && b.warehouseId === v.fromWarehouseId) : [];
                  const roll = l.batchId ? rolls.find((b) => b.id === l.batchId) : undefined;
                  const short = p && ((requested.get(p.id) ?? 0) > available + 0.0005 || (roll && l.qty > roll.qty + 0.0005));
                  return (
                    <tr key={l.key} className="border-t align-top">
                      <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-2">
                        <Combobox options={options} value={l.productId} onChange={(id) => update(l.key, { productId: id, batchId: null })} placeholder="Select product…" searchPlaceholder="Name, SKU or barcode" className="h-9" />
                      </td>
                      <td className="px-2 py-2">
                        {p?.trackBatches ? (
                          <Select
                            value={l.batchId ?? NONE}
                            onValueChange={(b) => {
                              const r = rolls.find((x) => x.id === b);
                              update(l.key, { batchId: b === NONE ? null : b, qty: r ? r.qty : l.qty });
                            }}
                          >
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>No specific roll</SelectItem>
                              {rolls.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.batchNo} · {formatQty(b.qty)} {p.unit}
                                  {b.shade ? ` · ${b.shade}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="block py-2 text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular text-muted-foreground">
                        {p ? `${formatQty(roll ? roll.qty : available)} ${p.unit}` : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={p && !p.allowFraction ? 1 : 0.001}
                          value={l.qty || ""}
                          onChange={(e) => update(l.key, { qty: num(e.target.value) })}
                          className={cn("h-9 text-right tabular", short && "border-destructive")}
                        />
                        {short && <p className="mt-1 text-right text-[11px] text-destructive">More than available</p>}
                      </td>
                      <td className="px-1 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label="Remove line"
                          onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [{ key: newKey(), productId: null, batchId: null, qty: 0 }]))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: newKey(), productId: null, batchId: null, qty: 0 }])}>
              <Plus className="size-4" />
              Add line
            </Button>
            <p className="text-sm text-muted-foreground">
              {lines.filter((l) => l.productId).length} item(s) · {formatQty(round3(totalQty))} units
            </p>
          </div>
        </CardContent>
      </Card>

      <ActionBar
        cancelHref={v.id ? `/inventory/transfers/${v.id}` : "/inventory/transfers"}
        pending={pending}
        canSubmit={!!valid}
        postLabel="Save & post"
        onDraft={() => run(() => saveTransferAction(payload()), { success: "Draft saved", redirectTo: (d) => `/inventory/transfers/${d.id}` })}
        onPost={() => run(() => saveAndPostTransferAction(payload()), { success: "Transfer posted", redirectTo: (d) => `/inventory/transfers/${d.id}` })}
      />
    </div>
  );
}

// ---- Adjustment ------------------------------------------------------------------------------

export interface AdjustmentFormValue {
  id?: string | null;
  date: string;
  warehouseId: string;
  reason: string;
  notes: string;
  lines: { productId: string | null; batchId: string | null; qtyChange: number; unitCost: number; notes: string }[];
}

export function AdjustmentForm({ initial, data, canCost }: { initial: AdjustmentFormValue; data: PickerData; canCost: boolean }) {
  const [v, setV] = useState(initial);
  const blank = () => ({ key: newKey(), productId: null as string | null, batchId: null as string | null, qtyChange: 0, unitCost: 0, notes: "" });
  const [lines, setLines] = useState(() => (initial.lines.length ? initial.lines.map((l) => ({ ...l, key: newKey() })) : [blank()]));
  const { run, pending, fieldErrors } = useAction();
  const byId = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const options = useProductOptions(data, v.warehouseId);
  const update = (key: string, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addProduct = (productId: string) =>
    setLines((ls) => {
      const b = ls.find((l) => !l.productId);
      if (b) return ls.map((l) => (l.key === b.key ? { ...l, productId, batchId: null } : l));
      return [...ls, { ...blank(), productId }];
    });

  let gain = 0;
  let loss = 0;
  for (const l of lines) {
    if (!l.productId) continue;
    const avg = data.balance[l.productId]?.[v.warehouseId]?.avgCost ?? 0;
    if (l.qtyChange > 0) gain += l.qtyChange * (l.unitCost || avg);
    else loss += -l.qtyChange * avg;
  }

  const payload = () => ({
    id: v.id ?? null,
    date: v.date,
    warehouseId: v.warehouseId,
    reason: v.reason as "correction",
    notes: v.notes,
    lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId!, batchId: l.batchId, qtyChange: l.qtyChange, unitCost: l.qtyChange > 0 ? l.unitCost : 0, notes: l.notes })),
  });
  const valid = v.warehouseId && lines.some((l) => l.productId) && lines.every((l) => !l.productId || l.qtyChange !== 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Adjustment details</CardTitle>
          <CardDescription>Use for damage, loss, samples or corrections. Posting updates stock and books the difference to Inventory Adjustments.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Warehouse" error={fieldErrors.warehouseId}>
            <Select value={v.warehouseId} onValueChange={(w) => { setV({ ...v, warehouseId: w }); setLines((ls) => ls.map((l) => ({ ...l, batchId: null }))); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose warehouse" />
              </SelectTrigger>
              <SelectContent>
                {data.warehouses.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reason">
            <Select value={v.reason} onValueChange={(r) => setV({ ...v, reason: r })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ADJUSTMENT_REASON_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date" htmlFor="date" error={fieldErrors.date}>
            <Input id="date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-3">
            <Textarea id="notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="What happened?" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Enter a positive quantity to add stock, negative to remove it.{canCost && " Increases use the average cost unless you enter one."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScanBox data={data} onPick={addProduct} />
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Product</th>
                  <th className="w-48 px-2 py-2 text-left">Roll / batch</th>
                  <th className="w-24 px-2 py-2 text-right">Current</th>
                  <th className="w-32 px-2 py-2 text-right">Change ±</th>
                  <th className="w-24 px-2 py-2 text-right">New qty</th>
                  {canCost && <th className="w-32 px-2 py-2 text-right">Unit cost</th>}
                  {canCost && <th className="w-28 px-2 py-2 text-right">Value</th>}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const p = l.productId ? byId.get(l.productId) : undefined;
                  const bal = p ? data.balance[p.id]?.[v.warehouseId] : undefined;
                  const current = bal?.qty ?? 0;
                  const avg = bal?.avgCost ?? 0;
                  const rolls = p ? data.batches.filter((b) => b.productId === p.id && b.warehouseId === v.warehouseId) : [];
                  const after = round3(current + l.qtyChange);
                  const lineValue = l.qtyChange > 0 ? l.qtyChange * (l.unitCost || avg) : l.qtyChange * avg;
                  return (
                    <tr key={l.key} className="border-t align-top">
                      <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="space-y-1.5 px-2 py-2">
                        <Combobox options={options} value={l.productId} onChange={(id) => update(l.key, { productId: id, batchId: null })} placeholder="Select product…" searchPlaceholder="Name, SKU or barcode" className="h-9" />
                        <Input value={l.notes} onChange={(e) => update(l.key, { notes: e.target.value })} placeholder="Line note (optional)" className="h-8 text-xs" />
                      </td>
                      <td className="px-2 py-2">
                        {p?.trackBatches ? (
                          <Select value={l.batchId ?? NONE} onValueChange={(b) => update(l.key, { batchId: b === NONE ? null : b })}>
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>No specific roll</SelectItem>
                              {rolls.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.batchNo} · {formatQty(b.qty)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="block py-2 text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular text-muted-foreground">{p ? formatQty(current) : "—"}</td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step={p && !p.allowFraction ? 1 : 0.001}
                          value={l.qtyChange || ""}
                          onChange={(e) => update(l.key, { qtyChange: num(e.target.value) })}
                          className={cn("h-9 text-right tabular", l.qtyChange > 0 && "text-success", l.qtyChange < 0 && "text-destructive")}
                          placeholder="+5 or -2"
                        />
                      </td>
                      <td className={cn("px-2 py-2.5 text-right font-medium tabular", after < 0 && "text-destructive")}>{p ? formatQty(after) : "—"}</td>
                      {canCost && (
                        <td className="px-2 py-2">
                          {l.qtyChange > 0 ? (
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.unitCost || ""}
                              placeholder={avg ? String(avg) : "0"}
                              onChange={(e) => update(l.key, { unitCost: num(e.target.value) })}
                              className="h-9 text-right tabular"
                            />
                          ) : (
                            <span className="block py-2 text-right text-xs text-muted-foreground tabular">{p ? `avg ${formatMoney(avg)}` : ""}</span>
                          )}
                        </td>
                      )}
                      {canCost && <td className={cn("px-2 py-2.5 text-right tabular", lineValue < 0 && "text-destructive")}>{p ? formatMoney(lineValue) : "—"}</td>}
                      <td className="px-1 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label="Remove line"
                          onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
              <Plus className="size-4" />
              Add line
            </Button>
            {canCost && (
              <dl className="w-full space-y-1.5 rounded-xl border bg-muted/30 p-4 text-sm sm:w-72">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Stock added</dt>
                  <dd className="tabular text-success">{formatMoney(gain)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Stock removed</dt>
                  <dd className="tabular text-destructive">-{formatMoney(loss)}</dd>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <dt>Net effect</dt>
                  <dd className="tabular">{formatMoney(gain - loss)}</dd>
                </div>
              </dl>
            )}
          </div>
        </CardContent>
      </Card>

      <ActionBar
        cancelHref={v.id ? `/inventory/adjustments/${v.id}` : "/inventory/adjustments"}
        pending={pending}
        canSubmit={!!valid}
        postLabel="Save & post"
        onDraft={() => run(() => saveAdjustmentAction(payload()), { success: "Draft saved", redirectTo: (d) => `/inventory/adjustments/${d.id}` })}
        onPost={() => run(() => saveAndPostAdjustmentAction(payload()), { success: "Adjustment posted", redirectTo: (d) => `/inventory/adjustments/${d.id}` })}
      />
    </div>
  );
}
