"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Link2, Loader2 } from "lucide-react";
import { addDays, formatQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { LineItemsEditor, type DocLinesValue } from "@/components/app/line-items-editor";
import { useAction } from "@/components/app/use-action";
import { saveAndPostSupplierBill, saveSupplierBillAction } from "@/app/(app)/purchasing/bills/actions";
import { Field, FormActions } from "./field";
import type { ProductWithFlags } from "./receipt-form";

/** Per-line links the shared line editor doesn't know about, keyed by the editor's line key. */
export interface BillLineMeta {
  goodsReceiptLineId?: string | null;
  purchaseOrderLineId?: string | null;
  /** Product the receipt / PO line was for: the link is dropped if the user picks another product */
  linkedProductId?: string | null;
  expenseAccountId?: string | null;
  batchNo?: string | null;
  /** Shown as "from GRN-0001 (40 m unbilled)" */
  sourceLabel?: string | null;
}

export interface BillFormValue {
  id?: string | null;
  date: string;
  /** Empty = follow the supplier's payment terms */
  dueDate: string;
  supplierId: string | null;
  supplierInvoiceNo: string;
  purchaseOrderId: string | null;
  goodsReceiptId: string | null;
  sourceLabel?: string | null;
  warehouseId: string | null;
  receivesStock: boolean;
  notes: string;
  doc: DocLinesValue;
  meta: Record<string, BillLineMeta>;
}

// A line whose product was changed no longer matches the receipt / PO line it came from
const isLinked = (productId: string | null, m: BillLineMeta) => m.linkedProductId === undefined || m.linkedProductId === productId;

export function BillForm({
  initial,
  suppliers,
  warehouses,
  products,
  accounts,
  receipts,
  canPost,
}: {
  initial: BillFormValue;
  suppliers: (ComboOption & { paymentTermsDays: number })[];
  warehouses: ComboOption[];
  products: ProductWithFlags[];
  accounts: ComboOption[];
  receipts: (ComboOption & { supplierId: string })[];
  canPost: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const { run, pending, fieldErrors } = useAction();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const set = <K extends keyof BillFormValue>(k: K, value: BillFormValue[K]) => setV((s) => ({ ...s, [k]: value }));
  const setMeta = (key: string, patch: BillLineMeta) => setV((s) => ({ ...s, meta: { ...s.meta, [key]: { ...s.meta[key], ...patch } } }));

  const supplier = suppliers.find((s) => s.value === v.supplierId);
  const autoDue = addDays(v.date, supplier?.paymentTermsDays ?? 0);
  const dueDate = v.dueDate || autoDue;
  const linked = !!(v.goodsReceiptId || v.purchaseOrderId);

  // Lines that need more than the editor captures: receipt links, expense accounts, roll numbers
  const details = v.doc.lines
    .filter((l) => l.productId || l.description.trim())
    .map((l, i) => {
      const p = l.productId ? byId.get(l.productId) : undefined;
      const m = v.meta[l.key] ?? {};
      const isStock = !!p && p.type !== "service";
      return { line: l, n: i + 1, p, m, isStock, fromGrn: !!m.goodsReceiptLineId && isLinked(l.productId, m) };
    });
  const unreceivedStock = details.filter((d) => d.isStock && !d.fromGrn);
  const needsWarehouse = v.receivesStock && unreceivedStock.length > 0;

  const payload = () => ({
    id: v.id ?? null,
    date: v.date,
    dueDate,
    supplierId: v.supplierId ?? "",
    supplierInvoiceNo: v.supplierInvoiceNo,
    purchaseOrderId: v.purchaseOrderId,
    goodsReceiptId: v.goodsReceiptId,
    warehouseId: v.warehouseId,
    receivesStock: v.receivesStock,
    notes: v.notes,
    documentDiscount: v.doc.documentDiscount,
    charges: v.doc.charges,
    lines: v.doc.lines
      .filter((l) => l.productId || l.description.trim())
      .map((l) => {
        const m = v.meta[l.key] ?? {};
        const p = l.productId ? byId.get(l.productId) : undefined;
        const keep = isLinked(l.productId, m);
        return {
          productId: l.productId,
          description: l.description,
          qty: l.qty,
          price: l.price,
          discountPct: l.discountPct,
          taxRate: l.taxRate,
          goodsReceiptLineId: keep ? (m.goodsReceiptLineId ?? null) : null,
          purchaseOrderLineId: keep ? (m.purchaseOrderLineId ?? null) : null,
          expenseAccountId: !p || p.type === "service" ? (m.expenseAccountId ?? null) : null,
          batchNo: p?.trackBatches ? (m.batchNo ?? null) : null,
        };
      }),
  });

  const save = (post: boolean) =>
    run(() => (post ? saveAndPostSupplierBill(payload()) : saveSupplierBillAction(payload())), {
      success: post ? "Bill posted" : "Draft saved",
      redirectTo: (d) => `/purchasing/bills/${d.id}`,
    });

  const receiptOptions = v.supplierId ? receipts.filter((r) => r.supplierId === v.supplierId) : receipts;

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
          <CardTitle>Bill details</CardTitle>
          <CardDescription>
            {v.sourceLabel ?? "Enter the supplier's invoice. Bill a goods receipt to clear it, or record a direct bill."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!v.id && !linked && (
            <Field label="Bill a goods receipt" className="sm:col-span-2 lg:col-span-4" hint="Optional: pick a receipt to fill the lines with what hasn't been billed yet">
              <Combobox
                options={receiptOptions}
                value={null}
                onChange={(id) => id && router.push(`/purchasing/bills/new?grn=${id}`)}
                placeholder={receiptOptions.length ? "Choose a goods receipt…" : "No unbilled receipts"}
                searchPlaceholder="GRN number or supplier"
                disabled={!receiptOptions.length}
              />
            </Field>
          )}
          <Field label="Supplier" error={fieldErrors.supplierId} required className="sm:col-span-2">
            <Combobox options={suppliers} value={v.supplierId} onChange={(id) => set("supplierId", id)} placeholder="Choose supplier…" disabled={linked} />
          </Field>
          <Field label="Supplier invoice no" htmlFor="inv" hint="As printed on their bill">
            <Input id="inv" value={v.supplierInvoiceNo} onChange={(e) => set("supplierInvoiceNo", e.target.value)} />
          </Field>
          <div className="hidden lg:block" />
          <Field label="Bill date" htmlFor="date" error={fieldErrors.date} required>
            <Input id="date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field
            label="Due date"
            htmlFor="due"
            error={fieldErrors.dueDate}
            hint={v.dueDate ? <button type="button" className="underline" onClick={() => set("dueDate", "")}>Use supplier terms</button> : supplier ? `${supplier.paymentTermsDays} days from bill date` : undefined}
          >
            <Input id="due" type="date" value={dueDate} min={v.date} onChange={(e) => set("dueDate", e.target.value)} />
          </Field>
          <Field label="Receive the goods with this bill" htmlFor="receives" hint="For deliveries without a goods receipt: stock lines go into the warehouse when the bill posts">
            <div className="flex h-9 items-center">
              <Switch id="receives" checked={v.receivesStock} onCheckedChange={(c) => set("receivesStock", c)} />
            </div>
          </Field>
          {(v.receivesStock || v.warehouseId) && (
            <Field label="Warehouse" error={fieldErrors.warehouseId} required={needsWarehouse}>
              <Combobox options={warehouses} value={v.warehouseId} onChange={(id) => set("warehouseId", id)} placeholder="Choose warehouse…" />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items & charges</CardTitle>
          <CardDescription>Prices are the supplier&apos;s billed rates. A difference from the receipt cost is posted to Inventory. Freight goes to Freight In.</CardDescription>
        </CardHeader>
        <CardContent>
          <LineItemsEditor mode="purchase" chargesLabel="Freight" products={products} value={v.doc} onChange={(doc) => set("doc", doc)} />
          {fieldErrors.lines && <p className="mt-2 text-sm text-destructive">{fieldErrors.lines}</p>}
        </CardContent>
      </Card>

      {details.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Where each line goes</CardTitle>
            <CardDescription>Receipt lines clear Goods Received Not Invoiced; services and other costs need an account.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y rounded-xl border p-0">
            {details.map(({ line, n, p, m, isStock, fromGrn }) => (
              <div key={line.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,18rem)] sm:items-center">
                <span className="text-sm text-muted-foreground">{n}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{line.description || p?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatQty(line.qty)} {p?.unit ?? ""}
                    {m.sourceLabel ? ` · ${m.sourceLabel}` : ""}
                  </p>
                </div>
                <div>
                  {fromGrn ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-info">
                      <Link2 className="size-3.5" />
                      Clears goods received not invoiced
                    </span>
                  ) : isStock ? (
                    v.receivesStock ? (
                      p?.trackBatches ? (
                        <Input value={m.batchNo ?? ""} onChange={(e) => setMeta(line.key, { batchNo: e.target.value })} placeholder="Roll / lot no (auto if blank)" className="h-8 text-xs" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Received into stock on posting</span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="size-3.5" />
                        Stock item: bill it from a receipt or turn on “Receive the goods”
                      </span>
                    )
                  ) : (
                    <Combobox
                      options={accounts}
                      value={m.expenseAccountId ?? null}
                      onChange={(id) => setMeta(line.key, { expenseAccountId: id })}
                      placeholder="General & Miscellaneous"
                      searchPlaceholder="Account name or code"
                      allowClear
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </CardContent>
      </Card>

      <FormActions>
        <Button type="button" variant="outline" asChild>
          <Link href={v.id ? `/purchasing/bills/${v.id}` : "/purchasing/bills"}>Cancel</Link>
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
