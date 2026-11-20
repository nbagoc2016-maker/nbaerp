"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { formatMoney, formatQty, round2, round3 } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import type { ProductOption } from "@/components/app/line-items-editor";
import { useAction } from "@/components/app/use-action";
import { saveAndPostGoodsReceipt, saveGoodsReceiptAction } from "@/app/(app)/purchasing/receipts/actions";
import { Field, FormActions } from "./field";

export interface RollValue {
  key: string;
  batchNo: string;
  qty: number;
}

export interface ReceiptLineValue {
  key: string;
  purchaseOrderLineId: string | null;
  productId: string | null;
  description: string;
  qty: number;
  unitCost: number;
  /** From the PO, for the "ordered / already received" hint */
  ordered?: number;
  received?: number;
  rolls: RollValue[];
}

export interface ReceiptFormValue {
  id?: string | null;
  date: string;
  supplierId: string | null;
  warehouseId: string | null;
  purchaseOrderId: string | null;
  poNumber?: string | null;
  supplierDeliveryRef: string;
  notes: string;
  lines: ReceiptLineValue[];
}

export type ProductWithFlags = ProductOption & { trackBatches: boolean };

const newKey = () => crypto.randomUUID();
const blank = (): ReceiptLineValue => ({ key: newKey(), purchaseOrderLineId: null, productId: null, description: "", qty: 1, unitCost: 0, rolls: [] });
const num = (v: string) => (v === "" ? 0 : Number(v));
const lineQty = (l: ReceiptLineValue) => (l.rolls.length ? round3(l.rolls.reduce((s, r) => s + (r.qty || 0), 0)) : l.qty);

export function ReceiptForm({
  initial,
  suppliers,
  warehouses,
  products,
  orders,
  canPost,
}: {
  initial: ReceiptFormValue;
  suppliers: ComboOption[];
  warehouses: ComboOption[];
  products: ProductWithFlags[];
  orders: ComboOption[];
  canPost: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const { run, pending, fieldErrors } = useAction();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(
    () => products.filter((p) => p.type !== "service").map((p) => ({ value: p.id, label: p.name, hint: p.trackBatches ? `${p.sku} · rolls` : p.sku, keywords: `${p.sku} ${p.barcode ?? ""}` })),
    [products]
  );
  const fromPo = !!v.purchaseOrderId;

  const set = <K extends keyof ReceiptFormValue>(k: K, value: ReceiptFormValue[K]) => setV((s) => ({ ...s, [k]: value }));
  const setLine = (key: string, patch: Partial<ReceiptLineValue>) => setV((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const removeLine = (key: string) => setV((s) => ({ ...s, lines: s.lines.length > 1 ? s.lines.filter((l) => l.key !== key) : [blank()] }));
  const pickProduct = (key: string, id: string | null) => {
    const p = id ? byId.get(id) : undefined;
    setLine(key, p ? { productId: p.id, description: p.name, unitCost: p.price, rolls: [] } : { productId: null });
  };
  const addRolls = (line: ReceiptLineValue, lengths: number[]) =>
    setLine(line.key, { rolls: [...line.rolls, ...lengths.filter((n) => n > 0).map((qty) => ({ key: newKey(), batchNo: "", qty }))] });

  const total = round2(v.lines.reduce((s, l) => s + round2(lineQty(l) * (l.unitCost || 0)), 0));

  const payload = () => ({
    id: v.id ?? null,
    date: v.date,
    supplierId: v.supplierId ?? "",
    warehouseId: v.warehouseId ?? "",
    purchaseOrderId: v.purchaseOrderId,
    supplierDeliveryRef: v.supplierDeliveryRef,
    notes: v.notes,
    lines: v.lines
      .filter((l) => l.productId)
      .map((l) => ({
        purchaseOrderLineId: l.purchaseOrderLineId,
        productId: l.productId!,
        description: l.description,
        qty: lineQty(l),
        unitCost: l.unitCost,
        rolls: l.rolls.filter((r) => r.qty > 0).map((r) => ({ batchNo: r.batchNo.trim() || null, qty: r.qty })),
      })),
  });

  const save = (post: boolean) =>
    run(() => (post ? saveAndPostGoodsReceipt(payload()) : saveGoodsReceiptAction(payload())), {
      success: post ? "Goods received and posted" : "Draft saved",
      redirectTo: (d) => `/purchasing/receipts/${d.id}`,
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
          <CardTitle>Delivery</CardTitle>
          <CardDescription>
            {fromPo ? `Receiving against purchase order ${v.poNumber ?? ""}.` : "Receive against a purchase order, or record a delivery without one."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!v.id && (
            <Field label="Purchase order" className="sm:col-span-2" hint={fromPo ? undefined : "Optional: pick one to fill the lines with what's still to come"}>
              <Combobox
                options={orders}
                value={v.purchaseOrderId}
                onChange={(id) => router.push(id ? `/purchasing/receipts/new?po=${id}` : "/purchasing/receipts/new")}
                placeholder="No purchase order"
                searchPlaceholder="PO number or supplier"
                allowClear
              />
            </Field>
          )}
          <Field label="Supplier" error={fieldErrors.supplierId} required className="sm:col-span-2">
            <Combobox options={suppliers} value={v.supplierId} onChange={(id) => set("supplierId", id)} placeholder="Choose supplier…" disabled={fromPo} />
          </Field>
          <Field label="Receiving warehouse" error={fieldErrors.warehouseId} required className="sm:col-span-2">
            <Combobox options={warehouses} value={v.warehouseId} onChange={(id) => set("warehouseId", id)} placeholder="Choose warehouse…" />
          </Field>
          <Field label="Date received" htmlFor="date" error={fieldErrors.date} required>
            <Input id="date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Supplier delivery ref" htmlFor="ref" hint="Delivery challan / DC number">
            <Input id="ref" value={v.supplierDeliveryRef} onChange={(e) => set("supplierDeliveryRef", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Goods received</CardTitle>
          <CardDescription>
            For roll / lot items enter each roll with its own length. Rolls left without a number are numbered from the receipt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {v.lines.map((line, i) => {
            const p = line.productId ? byId.get(line.productId) : undefined;
            const qty = lineQty(line);
            const over = line.ordered !== undefined && qty > round3(line.ordered - (line.received ?? 0)) + 0.0005;
            return (
              <div key={line.key} className="rounded-xl border p-3">
                <div className="grid gap-3 md:grid-cols-[2rem_minmax(0,1fr)_8rem_8rem_8rem_2.5rem] md:items-start">
                  <span className="hidden pt-2 text-sm text-muted-foreground md:block">{i + 1}</span>
                  <div className="space-y-1.5">
                    <Combobox
                      options={productOptions}
                      value={line.productId}
                      onChange={(id) => pickProduct(line.key, id)}
                      placeholder="Select product…"
                      searchPlaceholder="Name, SKU or barcode"
                      disabled={!!line.purchaseOrderLineId}
                      className="h-9"
                    />
                    <Input value={line.description} onChange={(e) => setLine(line.key, { description: e.target.value })} placeholder="Description" className="h-8 text-xs" />
                    {line.ordered !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Ordered {formatQty(line.ordered)} · received before {formatQty(line.received ?? 0)} {p?.unit}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground md:hidden">Qty</label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={p && !p.allowFraction ? 1 : 0.001}
                        value={line.rolls.length ? qty : line.qty || ""}
                        readOnly={line.rolls.length > 0}
                        onChange={(e) => setLine(line.key, { qty: num(e.target.value) })}
                        className="h-9 text-right tabular read-only:bg-muted/40"
                        aria-label="Quantity received"
                      />
                      {p && <span className="w-7 text-xs text-muted-foreground">{p.unit}</span>}
                    </div>
                    {over && <p className="text-right text-[11px] text-warning-foreground dark:text-warning">More than still on order</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground md:hidden">Unit cost</label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={line.unitCost || ""}
                      onChange={(e) => setLine(line.key, { unitCost: num(e.target.value) })}
                      className="h-9 text-right tabular"
                      aria-label="Unit cost"
                    />
                  </div>
                  <p className="pt-2 text-right text-sm font-medium tabular">{formatMoney(round2(qty * (line.unitCost || 0)))}</p>
                  <Button type="button" variant="ghost" size="icon" className="size-8 justify-self-end text-muted-foreground hover:text-destructive" onClick={() => removeLine(line.key)} aria-label="Remove line">
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {p?.trackBatches && <RollsEditor line={line} unit={p.unit} onChange={(rolls) => setLine(line.key, { rolls })} onAdd={(lengths) => addRolls(line, lengths)} />}
              </div>
            );
          })}
          {fieldErrors.lines && <p className="text-sm text-destructive">{fieldErrors.lines}</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" size="sm" onClick={() => setV((s) => ({ ...s, lines: [...s.lines, blank()] }))}>
              <Plus className="size-4" />
              Add line
            </Button>
            <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm sm:w-72">
              <div className="flex justify-between font-semibold">
                <span>Receipt value</span>
                <span className="tabular">{formatMoney(total)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Dr Inventory · Cr Goods Received Not Invoiced</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Condition of goods, shortages, vehicle number…" />
        </CardContent>
      </Card>

      <FormActions>
        <Button type="button" variant="outline" asChild>
          <Link href={v.id ? `/purchasing/receipts/${v.id}` : "/purchasing/receipts"}>Cancel</Link>
        </Button>
        <Button type="submit" variant={canPost ? "outline" : "default"} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save draft
        </Button>
        {canPost && (
          <Button type="button" disabled={pending} onClick={() => save(true)}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save & post
          </Button>
        )}
      </FormActions>
    </form>
  );
}

function RollsEditor({
  line,
  unit,
  onChange,
  onAdd,
}: {
  line: ReceiptLineValue;
  unit: string;
  onChange: (rolls: RollValue[]) => void;
  onAdd: (lengths: number[]) => void;
}) {
  const [quick, setQuick] = useState("");
  const addQuick = () => {
    const lengths = quick
      .split(/[\s,;]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (lengths.length) {
      onAdd(lengths);
      setQuick("");
    }
  };
  const update = (key: string, patch: Partial<RollValue>) => onChange(line.rolls.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="mt-3 rounded-lg bg-muted/30 p-3 md:ml-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Layers className="size-3.5" />
          Rolls / lots {line.rolls.length > 0 && `· ${line.rolls.length} roll${line.rolls.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center gap-1.5">
          <Input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addQuick();
              }
            }}
            placeholder={`Lengths, e.g. 38.5, 40, 41.2`}
            className="h-8 w-52 text-xs"
            aria-label="Quick add roll lengths"
          />
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={addQuick}>
            Add rolls
          </Button>
        </div>
      </div>
      {line.rolls.length === 0 ? (
        <p className="text-xs text-muted-foreground">No rolls entered: the whole quantity is received as one roll.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {line.rolls.map((r, i) => (
            <div key={r.key} className="flex items-center gap-1.5">
              <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
              <Input value={r.batchNo} onChange={(e) => update(r.key, { batchNo: e.target.value })} placeholder="Roll no (auto)" className="h-8 min-w-0 text-xs" aria-label={`Roll ${i + 1} number`} />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                value={r.qty || ""}
                onChange={(e) => update(r.key, { qty: num(e.target.value) })}
                className="h-8 w-24 shrink-0 text-right text-xs tabular"
                aria-label={`Roll ${i + 1} quantity`}
              />
              <span className="w-6 text-xs text-muted-foreground">{unit}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(line.rolls.filter((x) => x.key !== r.key))}
                aria-label={`Remove roll ${i + 1}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
