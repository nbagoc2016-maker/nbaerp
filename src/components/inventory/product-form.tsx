"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { Combobox } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatQty, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveProductAction } from "@/app/(app)/inventory/products/actions";
import { Field } from "./shared";

export interface ProductFormValue {
  id?: string | null;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  type: "stock" | "service";
  categoryId: string | null;
  brandId: string | null;
  unitId: string;
  taxRateId: string | null;
  costPrice: number;
  salePrice: number;
  minSalePrice: number;
  wholesalePrice: number;
  reorderLevel: number;
  reorderQty: number;
  trackBatches: boolean;
  color: string;
  size: string;
  material: string;
  imageUrl: string;
  isActive: boolean;
}

interface OpeningRoll {
  key: string;
  batchNo: string;
  qty: number;
  shade: string;
}
interface OpeningRow {
  key: string;
  warehouseId: string;
  qty: number;
  unitCost: number;
  rolls: OpeningRoll[];
}

export interface ProductFormOptionsProps {
  categories: { value: string; label: string }[];
  brands: { value: string; label: string }[];
  units: { value: string; label: string; allowFraction: boolean; code: string }[];
  taxRates: { value: string; label: string; rate: number; isDefault: boolean }[];
  warehouses: { value: string; label: string; hint?: string }[];
  nextSku: string;
}

const NONE = "__none__";
const num = (v: string) => (v === "" ? 0 : Number(v));
const key = () => crypto.randomUUID();

/** EAN-13 in the in-store range (prefix 20) with a valid check digit. */
function generateBarcode() {
  const digits = [2, 0, ...Array.from({ length: 10 }, () => Math.floor(Math.random() * 10))];
  const sum = digits.reduce((t, d, i) => t + d * (i % 2 === 0 ? 1 : 3), 0);
  return digits.join("") + String((10 - (sum % 10)) % 10);
}

function emptyProduct(opts: ProductFormOptionsProps): ProductFormValue {
  const defaultTax = opts.taxRates.find((t) => t.isDefault && t.rate > 0);
  return {
    sku: opts.nextSku,
    barcode: "",
    name: "",
    description: "",
    type: "stock",
    categoryId: null,
    brandId: null,
    unitId: opts.units.find((u) => u.code === "pcs")?.value ?? opts.units[0]?.value ?? "",
    taxRateId: defaultTax?.value ?? null,
    costPrice: 0,
    salePrice: 0,
    minSalePrice: 0,
    wholesalePrice: 0,
    reorderLevel: 0,
    reorderQty: 0,
    trackBatches: false,
    color: "",
    size: "",
    material: "",
    imageUrl: "",
    isActive: true,
  };
}

/** Create (no `initial`) or edit a product. */
export function ProductForm({ initial: given, options, canCost }: { initial?: ProductFormValue; options: ProductFormOptionsProps; canCost: boolean }) {
  const initial = given ?? emptyProduct(options);
  const isEdit = !!initial.id;
  const [v, setV] = useState<ProductFormValue>(initial);
  const [opening, setOpening] = useState<OpeningRow[]>(() =>
    options.warehouses.slice(0, 1).map((w) => ({ key: key(), warehouseId: w.value, qty: 0, unitCost: 0, rolls: [] }))
  );
  const [openingDate, setOpeningDate] = useState(today());
  const { run, pending, fieldErrors } = useAction();
  const set = <K extends keyof ProductFormValue>(k: K, val: ProductFormValue[K]) => setV((cur) => ({ ...cur, [k]: val }));

  const unit = options.units.find((u) => u.value === v.unitId);
  const tax = options.taxRates.find((t) => t.value === v.taxRateId);
  const margin = v.salePrice > 0 ? ((v.salePrice - v.costPrice) / v.salePrice) * 100 : null;
  const markup = v.costPrice > 0 ? ((v.salePrice - v.costPrice) / v.costPrice) * 100 : null;
  const minMargin = v.minSalePrice > 0 && v.costPrice > 0 ? ((v.minSalePrice - v.costPrice) / v.minSalePrice) * 100 : null;

  const openingTotals = useMemo(() => {
    let qty = 0;
    let value = 0;
    for (const r of opening) {
      const q = v.trackBatches && r.rolls.length ? r.rolls.reduce((t, x) => t + x.qty, 0) : r.qty;
      qty += q;
      value += q * (r.unitCost || v.costPrice);
    }
    return { qty, value };
  }, [opening, v.trackBatches, v.costPrice]);

  const updateRow = (k: string, patch: Partial<OpeningRow>) => setOpening((rows) => rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const usedWarehouses = new Set(opening.map((r) => r.warehouseId));

  const submit = () => {
    const payload = {
      ...v,
      id: v.id ?? null,
      skuAuto: !isEdit && v.sku.trim() === options.nextSku,
      wholesalePrice: v.wholesalePrice || null,
      openingDate,
      opening:
        !isEdit && canCost && v.type === "stock"
          ? opening.map((r) => ({
              warehouseId: r.warehouseId,
              qty: v.trackBatches && r.rolls.length ? r.rolls.reduce((t, x) => t + x.qty, 0) : r.qty,
              unitCost: r.unitCost || v.costPrice,
              rolls: v.trackBatches ? r.rolls.filter((x) => x.batchNo.trim() || x.qty).map((x) => ({ batchNo: x.batchNo, qty: x.qty, shade: x.shade })) : [],
            }))
          : [],
    };
    run(() => saveProductAction(payload), {
      success: isEdit ? "Product saved" : "Product created",
      redirectTo: (d) => `/inventory/products/${d.id}`,
    });
  };

  const qtyStep = unit?.allowFraction ? "0.001" : "1";

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>How the item is named, coded and grouped.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Product name" htmlFor="name" error={fieldErrors.name} className="sm:col-span-2">
            <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Premium Lawn - Floral Print" autoFocus={!isEdit} required />
          </Field>
          <Field label="SKU" htmlFor="sku" error={fieldErrors.sku} hint={!isEdit && v.sku === options.nextSku ? "Next number in the SKU series" : undefined}>
            <Input id="sku" value={v.sku} onChange={(e) => set("sku", e.target.value)} className="tabular" />
          </Field>
          <Field label="Barcode" htmlFor="barcode" error={fieldErrors.barcode}>
            <div className="flex gap-2">
              <Input id="barcode" value={v.barcode} onChange={(e) => set("barcode", e.target.value)} className="tabular" placeholder="Scan or type" />
              <Button type="button" variant="outline" onClick={() => set("barcode", generateBarcode())} title="Generate an in-store EAN-13 barcode">
                <Wand2 className="size-4" />
                Generate
              </Button>
            </div>
          </Field>
          <Field label="Type" error={fieldErrors.type}>
            <Select value={v.type} onValueChange={(t) => set("type", t as "stock" | "service")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stock">Stock item (tracks quantity)</SelectItem>
                <SelectItem value="service">Service (no stock)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Unit" error={fieldErrors.unitId}>
            <Select value={v.unitId} onValueChange={(u) => set("unitId", u)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose unit" />
              </SelectTrigger>
              <SelectContent>
                {options.units.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category" error={fieldErrors.categoryId}>
            <Combobox options={options.categories} value={v.categoryId} onChange={(c) => set("categoryId", c)} placeholder="No category" allowClear />
          </Field>
          <Field label="Brand" error={fieldErrors.brandId}>
            <Combobox options={options.brands} value={v.brandId} onChange={(b) => set("brandId", b)} placeholder="No brand" allowClear />
          </Field>
          <Field label="Image URL" htmlFor="imageUrl" hint="Optional link to a product photo">
            <Input id="imageUrl" value={v.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2 lg:col-span-3">
            <Textarea id="description" value={v.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Shown on quotations and invoices" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>Default prices for sales and purchases. Stock is valued at moving-average cost.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {canCost && (
            <Field label="Cost price" htmlFor="costPrice" error={fieldErrors.costPrice} hint="Last purchase cost">
              <Input id="costPrice" type="number" min={0} step="0.01" inputMode="decimal" value={v.costPrice || ""} onChange={(e) => set("costPrice", num(e.target.value))} className="text-right tabular" />
            </Field>
          )}
          <Field label="Sale price" htmlFor="salePrice" error={fieldErrors.salePrice}>
            <Input id="salePrice" type="number" min={0} step="0.01" inputMode="decimal" value={v.salePrice || ""} onChange={(e) => set("salePrice", num(e.target.value))} className="text-right tabular" />
          </Field>
          <Field label="Minimum sale price" htmlFor="minSalePrice" error={fieldErrors.minSalePrice} hint="Floor for discounts and bargaining">
            <Input id="minSalePrice" type="number" min={0} step="0.01" inputMode="decimal" value={v.minSalePrice || ""} onChange={(e) => set("minSalePrice", num(e.target.value))} className="text-right tabular" />
          </Field>
          <Field label="Wholesale price" htmlFor="wholesalePrice" hint="Used for wholesale customers">
            <Input id="wholesalePrice" type="number" min={0} step="0.01" inputMode="decimal" value={v.wholesalePrice || ""} onChange={(e) => set("wholesalePrice", num(e.target.value))} className="text-right tabular" />
          </Field>
          <Field label="Tax rate" error={fieldErrors.taxRateId}>
            <Select value={v.taxRateId ?? NONE} onValueChange={(t) => set("taxRateId", t === NONE ? null : t)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No tax</SelectItem>
                {options.taxRates.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} ({t.rate}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {canCost && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm sm:col-span-2 lg:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Margin</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular", margin === null ? "text-muted-foreground" : margin < 0 ? "text-destructive" : margin < 15 ? "text-warning-foreground dark:text-warning" : "text-success")}>
                {margin === null ? "—" : `${margin.toFixed(1)}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {markup !== null ? `Markup ${markup.toFixed(1)}% · ` : ""}
                Profit {formatMoney(v.salePrice - v.costPrice)} per {unit?.code ?? "unit"}
                {minMargin !== null ? ` · at minimum price ${minMargin.toFixed(1)}%` : ""}
              </p>
              {tax && tax.rate > 0 && <p className="mt-1 text-xs text-muted-foreground">Price with {tax.rate}% tax: {formatMoney(v.salePrice * (1 + tax.rate / 100))}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {v.type === "stock" && (
        <Card>
          <CardHeader>
            <CardTitle>Stock control</CardTitle>
            <CardDescription>When to reorder, and whether to track individual rolls or lots.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Reorder level" htmlFor="reorderLevel" hint="Flag as low stock at or below this quantity">
              <Input id="reorderLevel" type="number" min={0} step={qtyStep} value={v.reorderLevel || ""} onChange={(e) => set("reorderLevel", num(e.target.value))} className="text-right tabular" />
            </Field>
            <Field label="Reorder quantity" htmlFor="reorderQty" hint="Suggested quantity to buy">
              <Input id="reorderQty" type="number" min={0} step={qtyStep} value={v.reorderQty || ""} onChange={(e) => set("reorderQty", num(e.target.value))} className="text-right tabular" />
            </Field>
            <label htmlFor="trackBatches" className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <Switch id="trackBatches" checked={v.trackBatches} onCheckedChange={(c) => set("trackBatches", c)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Track rolls / batches</span>
                <span className="block text-xs text-muted-foreground">Each thaan or lot keeps its own number, length and shade.</span>
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Attributes</CardTitle>
          <CardDescription>Optional details for searching and labels.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Colour" htmlFor="color">
            <Input id="color" value={v.color} onChange={(e) => set("color", e.target.value)} placeholder="e.g. Navy" />
          </Field>
          <Field label="Size" htmlFor="size">
            <Input id="size" value={v.size} onChange={(e) => set("size", e.target.value)} placeholder="e.g. Medium, 54 inch" />
          </Field>
          <Field label="Material" htmlFor="material">
            <Input id="material" value={v.material} onChange={(e) => set("material", e.target.value)} placeholder="e.g. Cotton Lawn" />
          </Field>
        </CardContent>
      </Card>

      {!isEdit && canCost && v.type === "stock" && (
        <Card>
          <CardHeader>
            <CardTitle>Opening stock</CardTitle>
            <CardDescription>
              Optional. Stock you already hold, booked to Inventory against Opening Balance Equity.
              {v.trackBatches && " List each roll with its number and length."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="As of date" htmlFor="openingDate">
                <Input id="openingDate" type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} className="w-44" />
              </Field>
            </div>
            <div className="space-y-3">
              {opening.map((r) => {
                const rollQty = r.rolls.reduce((t, x) => t + x.qty, 0);
                return (
                  <div key={r.key} className="space-y-3 rounded-xl border p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end">
                      <Field label="Warehouse">
                        <Select value={r.warehouseId} onValueChange={(w) => updateRow(r.key, { warehouseId: w })}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.warehouses.map((w) => (
                              <SelectItem key={w.value} value={w.value} disabled={w.value !== r.warehouseId && usedWarehouses.has(w.value)}>
                                {w.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={`Quantity${unit ? ` (${unit.code})` : ""}`}>
                        <Input
                          type="number"
                          min={0}
                          step={qtyStep}
                          value={v.trackBatches && r.rolls.length ? rollQty : r.qty || ""}
                          readOnly={v.trackBatches && r.rolls.length > 0}
                          onChange={(e) => updateRow(r.key, { qty: num(e.target.value) })}
                          className="text-right tabular"
                        />
                      </Field>
                      <Field label="Unit cost">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.unitCost || ""}
                          placeholder={v.costPrice ? String(v.costPrice) : "0"}
                          onChange={(e) => updateRow(r.key, { unitCost: num(e.target.value) })}
                          className="text-right tabular"
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove warehouse"
                        onClick={() => setOpening((rows) => rows.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {v.trackBatches && (
                      <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rolls in this warehouse</p>
                        {r.rolls.map((roll) => (
                          <div key={roll.key} className="grid grid-cols-[1fr_7rem_auto] gap-2 sm:grid-cols-[1fr_8rem_8rem_auto]">
                            <Input
                              value={roll.batchNo}
                              placeholder="Roll no. e.g. R-0042"
                              onChange={(e) => updateRow(r.key, { rolls: r.rolls.map((x) => (x.key === roll.key ? { ...x, batchNo: e.target.value } : x)) })}
                              className="h-8"
                            />
                            <Input
                              type="number"
                              min={0}
                              step={qtyStep}
                              value={roll.qty || ""}
                              placeholder="Length"
                              onChange={(e) => updateRow(r.key, { rolls: r.rolls.map((x) => (x.key === roll.key ? { ...x, qty: num(e.target.value) } : x)) })}
                              className="h-8 text-right tabular"
                            />
                            <Input
                              value={roll.shade}
                              placeholder="Shade"
                              onChange={(e) => updateRow(r.key, { rolls: r.rolls.map((x) => (x.key === roll.key ? { ...x, shade: e.target.value } : x)) })}
                              className="hidden h-8 sm:block"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              aria-label="Remove roll"
                              onClick={() => updateRow(r.key, { rolls: r.rolls.filter((x) => x.key !== roll.key) })}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateRow(r.key, { rolls: [...r.rolls, { key: key(), batchNo: "", qty: 0, shade: "" }] })}
                        >
                          <Plus className="size-4" />
                          Add roll
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={usedWarehouses.size >= options.warehouses.length}
                onClick={() => {
                  const next = options.warehouses.find((w) => !usedWarehouses.has(w.value));
                  if (next) setOpening((rows) => [...rows, { key: key(), warehouseId: next.value, qty: 0, unitCost: 0, rolls: [] }]);
                }}
              >
                <Plus className="size-4" />
                Add warehouse
              </Button>
              <p className="text-sm text-muted-foreground">
                Total {formatQty(openingTotals.qty)} {unit?.code} · <span className="font-medium text-foreground tabular">{formatMoney(openingTotals.value)}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isEdit && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Active</p>
              <p className="text-sm text-muted-foreground">Inactive products are hidden from sales and purchase pickers but keep their history.</p>
            </div>
            <Switch checked={v.isActive} onCheckedChange={(c) => set("isActive", c)} aria-label="Active" />
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <Button type="button" variant="outline" asChild>
          <Link href={isEdit ? `/inventory/products/${v.id}` : "/inventory/products"}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending || !v.name.trim() || !v.unitId}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
