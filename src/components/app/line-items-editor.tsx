"use client";

import { useMemo, useRef } from "react";
import { Plus, ScanBarcode, Trash2 } from "lucide-react";
import { calcDocument } from "@/lib/doc-calc";
import { formatMoney, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "./combobox";

/** What the editor needs to know about each product. Pages load these on the server. */
export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  unit: string;
  allowFraction: boolean;
  /** Default price for this document: sale price for sales docs, cost for purchase docs */
  price: number;
  taxRate: number;
  minPrice?: number;
  onHand?: number;
  type?: "stock" | "service";
}

export interface DocLine {
  key: string;
  productId: string | null;
  description: string;
  qty: number;
  price: number;
  discountPct: number;
  taxRate: number;
}

export interface DocLinesValue {
  lines: DocLine[];
  documentDiscount: number;
  charges: number;
}

export const emptyLine = (): DocLine => ({
  key: crypto.randomUUID(),
  productId: null,
  description: "",
  qty: 1,
  price: 0,
  discountPct: 0,
  taxRate: 0,
});

export const emptyDocLines = (): DocLinesValue => ({ lines: [emptyLine()], documentDiscount: 0, charges: 0 });

const num = (v: string) => (v === "" ? 0 : Number(v));

export function LineItemsEditor({
  products,
  value,
  onChange,
  mode = "sale",
  showStock = mode === "sale",
  chargesLabel = mode === "sale" ? "Delivery charges" : "Freight",
  readOnlyPrices,
}: {
  products: ProductOption[];
  value: DocLinesValue;
  onChange: (v: DocLinesValue) => void;
  mode?: "sale" | "purchase";
  showStock?: boolean;
  chargesLabel?: string;
  readOnlyPrices?: boolean;
}) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const options = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.name,
        hint: showStock && p.type !== "service" && p.onHand !== undefined ? `${p.sku} · ${formatQty(p.onHand)} ${p.unit}` : p.sku,
        keywords: `${p.sku} ${p.barcode ?? ""}`,
      })),
    [products, showStock]
  );
  const scanRef = useRef<HTMLInputElement>(null);
  const totals = calcDocument(value.lines, { documentDiscount: value.documentDiscount, charges: value.charges });

  const setLines = (lines: DocLine[]) => onChange({ ...value, lines });
  const update = (key: string, patch: Partial<DocLine>) => setLines(value.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickProduct = (key: string, productId: string | null) => {
    const p = productId ? byId.get(productId) : undefined;
    update(key, p ? { productId: p.id, description: p.name, price: p.price, taxRate: p.taxRate } : { productId: null });
  };

  // Scan or type a barcode / SKU and press Enter to add (or bump) a line
  const onScan = (code: string) => {
    const p = products.find((x) => x.barcode === code || x.sku.toLowerCase() === code.toLowerCase());
    if (!p) return false;
    const existing = value.lines.find((l) => l.productId === p.id);
    if (existing) update(existing.key, { qty: existing.qty + 1 });
    else {
      const blank = value.lines.find((l) => !l.productId && !l.description);
      const line = { ...(blank ?? emptyLine()), productId: p.id, description: p.name, price: p.price, taxRate: p.taxRate, qty: 1 };
      setLines(blank ? value.lines.map((l) => (l.key === blank.key ? line : l)) : [...value.lines, line]);
    }
    return true;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={scanRef}
            placeholder="Scan barcode or type SKU + Enter"
            className="h-9 pl-8"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const input = e.currentTarget;
              if (onScan(input.value.trim())) input.value = "";
              else input.select();
            }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Item</th>
              <th className="w-28 px-2 py-2 text-right">Qty</th>
              <th className="w-32 px-2 py-2 text-right">{mode === "sale" ? "Price" : "Cost"}</th>
              <th className="w-20 px-2 py-2 text-right">Disc %</th>
              <th className="w-20 px-2 py-2 text-right">Tax %</th>
              <th className="w-32 px-2 py-2 text-right">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {value.lines.map((line, i) => {
              const p = line.productId ? byId.get(line.productId) : undefined;
              const calc = totals.lines[i];
              const belowMin = mode === "sale" && p?.minPrice && line.price < p.minPrice;
              const short = showStock && p && p.type !== "service" && p.onHand !== undefined && line.qty > p.onHand;
              return (
                <tr key={line.key} className="border-t align-top">
                  <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="space-y-1.5 px-2 py-2">
                    <Combobox
                      options={options}
                      value={line.productId}
                      onChange={(v) => pickProduct(line.key, v)}
                      placeholder="Select product…"
                      searchPlaceholder="Name, SKU or barcode"
                      className="h-9"
                    />
                    <Input
                      value={line.description}
                      onChange={(e) => update(line.key, { description: e.target.value })}
                      placeholder="Description"
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={p && !p.allowFraction ? 1 : 0.01}
                        value={line.qty || ""}
                        onChange={(e) => update(line.key, { qty: num(e.target.value) })}
                        className={cn("h-9 text-right tabular", short && "border-warning ring-warning/30")}
                      />
                      {p && <span className="w-8 text-xs text-muted-foreground">{p.unit}</span>}
                    </div>
                    {short && <p className="mt-1 text-right text-[11px] text-warning-foreground dark:text-warning">Only {formatQty(p!.onHand)} in stock</p>}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={line.price || ""}
                      readOnly={readOnlyPrices}
                      onChange={(e) => update(line.key, { price: num(e.target.value) })}
                      className={cn("h-9 text-right tabular", belowMin && "border-destructive")}
                    />
                    {belowMin && <p className="mt-1 text-right text-[11px] text-destructive">Below min {formatMoney(p!.minPrice)}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={line.discountPct || ""}
                      onChange={(e) => update(line.key, { discountPct: num(e.target.value) })}
                      className="h-9 text-right tabular"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={line.taxRate || ""}
                      onChange={(e) => update(line.key, { taxRate: num(e.target.value) })}
                      className="h-9 text-right tabular"
                    />
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium tabular">{formatMoney(calc?.lineTotal ?? 0)}</td>
                  <td className="px-1 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setLines(value.lines.length > 1 ? value.lines.filter((l) => l.key !== line.key) : [emptyLine()])}
                      aria-label="Remove line"
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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => setLines([...value.lines, emptyLine()])}>
          <Plus className="size-4" />
          Add line
        </Button>
        <dl className="w-full space-y-2 rounded-xl border bg-muted/30 p-4 text-sm sm:w-80">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{formatMoney(totals.subtotal)}</dd>
          </div>
          {totals.lineDiscounts > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Line discounts</dt>
              <dd className="tabular text-destructive">-{formatMoney(totals.lineDiscounts)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Bill discount</dt>
            <dd>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={value.documentDiscount || ""}
                onChange={(e) => onChange({ ...value, documentDiscount: num(e.target.value) })}
                className="h-8 w-28 text-right tabular"
              />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="tabular">{formatMoney(totals.taxTotal)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{chargesLabel}</dt>
            <dd>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={value.charges || ""}
                onChange={(e) => onChange({ ...value, charges: num(e.target.value) })}
                className="h-8 w-28 text-right tabular"
              />
            </dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{formatMoney(totals.total)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/** Strip UI keys before sending to a server action. */
export function toLinePayload(v: DocLinesValue) {
  return {
    documentDiscount: v.documentDiscount,
    charges: v.charges,
    lines: v.lines
      .filter((l) => l.productId || l.description.trim())
      .map(({ productId, description, qty, price, discountPct, taxRate }) => ({ productId, description, qty, price, discountPct, taxRate })),
  };
}
