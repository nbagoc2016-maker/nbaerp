"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveInvoiceAction } from "@/app/(app)/sales/invoices/actions";
import { saveOrderAction } from "@/app/(app)/sales/orders/actions";
import { saveQuotationAction } from "@/app/(app)/sales/quotations/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { LineItemsEditor, toLinePayload, type DocLinesValue, type ProductOption } from "@/components/app/line-items-editor";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { calcDocument } from "@/lib/doc-calc";
import { addDays, formatMoney, round2 } from "@/lib/format";
import { WALK_IN } from "@/server/services/sales-schemas";
import { Field, FormActionBar } from "./common";

export type SalesDocKind = "invoice" | "quotation" | "order";

export interface SalesDocInitial {
  id?: string;
  number?: string;
  date: string;
  /** Due date (invoice), valid until (quotation) or delivery date (order) */
  secondaryDate: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  warehouseId: string | null;
  salesperson: string;
  terms: string;
  notes: string;
  salesOrderId?: string | null;
  quotationId?: string | null;
  lines: DocLinesValue;
}

export type CustomerOption = ComboOption & { priceLevel: "retail" | "wholesale"; paymentTermsDays: number; phone: string | null };

const COPY: Record<SalesDocKind, { secondary: string; base: string; noun: string }> = {
  invoice: { secondary: "Due date", base: "/sales/invoices", noun: "invoice" },
  quotation: { secondary: "Valid until", base: "/sales/quotations", noun: "quotation" },
  order: { secondary: "Delivery date", base: "/sales/orders", noun: "order" },
};

export function SalesDocForm({
  kind,
  initial,
  products,
  priceMap,
  stockMap,
  customers,
  warehouses,
  credit,
  canPost,
}: {
  kind: SalesDocKind;
  initial: SalesDocInitial;
  products: ProductOption[];
  priceMap: Record<string, { retail: number; wholesale: number | null }>;
  stockMap: Record<string, Record<string, number>>;
  customers: CustomerOption[];
  warehouses: ComboOption[];
  credit: Record<string, { balance: number; creditLimit: number }>;
  canPost: boolean;
}) {
  const copy = COPY[kind];
  const [v, setV] = useState(initial);
  const [secondaryTouched, setSecondaryTouched] = useState(!!initial.id);
  const { run, pending, fieldErrors } = useAction();
  const set = <K extends keyof SalesDocInitial>(k: K, val: SalesDocInitial[K]) => setV((p) => ({ ...p, [k]: val }));

  const customer = customers.find((c) => c.value === v.customerId) ?? null;
  const allowWalkIn = kind !== "order";
  const customerOptions = useMemo<ComboOption[]>(
    () => (allowWalkIn ? [{ value: WALK_IN, label: "Walk-in customer", hint: "No account", keywords: "cash counter" }, ...customers] : customers),
    [allowWalkIn, customers]
  );

  // Prices follow the customer's price list; stock follows the chosen warehouse
  const priceLevel = customer?.priceLevel ?? "retail";
  const editorProducts = useMemo<ProductOption[]>(
    () =>
      products.map((p) => {
        const pm = priceMap[p.id];
        const wholesale = priceLevel === "wholesale" && pm?.wholesale ? pm.wholesale : null;
        const stock = stockMap[p.id] ?? {};
        return {
          ...p,
          price: wholesale ?? pm?.retail ?? p.price,
          minPrice: wholesale && p.minPrice ? Math.min(p.minPrice, wholesale) : p.minPrice,
          onHand: v.warehouseId ? (stock[v.warehouseId] ?? 0) : Object.values(stock).reduce((a, b) => a + b, 0),
        };
      }),
    [products, priceMap, stockMap, priceLevel, v.warehouseId]
  );

  const pickCustomer = (value: string | null) => {
    const id = value && value !== WALK_IN ? value : null;
    const c = customers.find((x) => x.value === id);
    setV((p) => ({
      ...p,
      customerId: id,
      customerPhone: c?.phone ?? (id ? "" : p.customerPhone),
      secondaryDate: kind === "invoice" && !secondaryTouched ? addDays(p.date, c?.paymentTermsDays ?? 0) : p.secondaryDate,
    }));
  };

  const setDate = (date: string) =>
    setV((p) => ({
      ...p,
      date,
      secondaryDate: kind === "invoice" && !secondaryTouched ? addDays(date, customer?.paymentTermsDays ?? 0) : p.secondaryDate,
    }));

  const totals = calcDocument(v.lines.lines, { documentDiscount: v.lines.documentDiscount, charges: v.lines.charges });
  const cr = v.customerId ? credit[v.customerId] : undefined;
  const overLimit = cr && cr.creditLimit > 0 && kind !== "quotation" ? round2(cr.balance + totals.total - cr.creditLimit) : 0;

  const save = (mode: "draft" | "final") => {
    const lines = toLinePayload(v.lines);
    if (!lines.lines.length) {
      toast.error("Add at least one line");
      return;
    }
    const common = { id: v.id, date: v.date, notes: v.notes, ...lines };
    const success = (n: string) => (mode === "final" ? (kind === "invoice" ? `Invoice ${n} posted` : kind === "order" ? `Order ${n} confirmed` : `Quotation ${n} saved`) : `Saved ${n}`);
    if (kind === "invoice") {
      run(
        () =>
          saveInvoiceAction({
            ...common,
            dueDate: v.secondaryDate || null,
            customerId: v.customerId,
            customerName: v.customerId ? null : v.customerName,
            customerPhone: v.customerPhone,
            warehouseId: v.warehouseId ?? "",
            salesOrderId: v.salesOrderId ?? null,
            salesperson: v.salesperson,
            post: mode === "final",
          }),
        {
          success: (d) => success(d.number),
          onSuccess: (d) => d.warning && toast.warning(d.warning, { duration: 8000 }),
          redirectTo: (d) => `/sales/invoices/${d.id}`,
        }
      );
    } else if (kind === "order") {
      run(
        () =>
          saveOrderAction({
            ...common,
            deliveryDate: v.secondaryDate || null,
            customerId: v.customerId ?? "",
            warehouseId: v.warehouseId,
            quotationId: v.quotationId ?? null,
            confirm: mode === "final",
          }),
        { success: (d) => success(d.number), redirectTo: (d) => `/sales/orders/${d.id}` }
      );
    } else {
      run(
        () =>
          saveQuotationAction({
            ...common,
            validUntil: v.secondaryDate || null,
            customerId: v.customerId,
            customerName: v.customerId ? null : v.customerName,
            terms: v.terms,
          }),
        { success: (d) => success(d.number), redirectTo: (d) => `/sales/quotations/${d.id}` }
      );
    }
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(kind === "quotation" ? "final" : "draft");
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{kind === "quotation" ? "Quotation details" : kind === "order" ? "Order details" : "Invoice details"}</CardTitle>
          <CardDescription>
            {kind === "invoice"
              ? "Pick a customer or sell to a walk-in. Due date follows the customer's payment terms."
              : kind === "order"
                ? "Book what the customer ordered; invoice it all at once or in parts."
                : "Price an offer for a customer. You can turn it into an order or invoice later."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Customer" required={kind === "order"} error={fieldErrors.customerId} className="sm:col-span-2 lg:col-span-1">
            <Combobox
              options={customerOptions}
              value={v.customerId ?? (allowWalkIn ? WALK_IN : null)}
              onChange={pickCustomer}
              placeholder="Select customer…"
              searchPlaceholder="Name, code or phone"
            />
            {cr && (
              <p className="text-xs text-muted-foreground">
                Balance <span className="tabular font-medium text-foreground">{formatMoney(cr.balance)}</span>
                {cr.creditLimit > 0 && <> · limit {formatMoney(cr.creditLimit)}</>}
                {customer?.priceLevel === "wholesale" && <> · wholesale prices</>}
              </p>
            )}
          </Field>
          {!v.customerId && allowWalkIn && (
            <>
              <Field label="Name on document" htmlFor="customerName">
                <Input id="customerName" value={v.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Walk-in customer" />
              </Field>
              {kind === "invoice" && (
                <Field label="Phone" htmlFor="customerPhone">
                  <Input id="customerPhone" type="tel" value={v.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} />
                </Field>
              )}
            </>
          )}
          <Field label="Date" htmlFor="date" required error={fieldErrors.date}>
            <Input id="date" type="date" value={v.date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label={copy.secondary} htmlFor="secondaryDate">
            <Input
              id="secondaryDate"
              type="date"
              value={v.secondaryDate}
              min={v.date}
              onChange={(e) => {
                setSecondaryTouched(true);
                set("secondaryDate", e.target.value);
              }}
            />
          </Field>
          {kind !== "quotation" && (
            <Field label={kind === "order" ? "Ship from" : "Warehouse"} required={kind === "invoice"} error={fieldErrors.warehouseId}>
              <Combobox
                options={warehouses}
                value={v.warehouseId}
                onChange={(w) => set("warehouseId", w)}
                placeholder="Select warehouse…"
                allowClear={kind === "order"}
              />
            </Field>
          )}
          {kind === "invoice" && (
            <Field label="Salesperson" htmlFor="salesperson">
              <Input id="salesperson" value={v.salesperson} onChange={(e) => set("salesperson", e.target.value)} />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Scan a barcode or pick products. Totals are re-checked on the server when you save.</CardDescription>
        </CardHeader>
        <CardContent>
          <LineItemsEditor products={editorProducts} value={v.lines} onChange={(lines) => set("lines", lines)} mode="sale" showStock={kind !== "quotation"} />
          {fieldErrors.lines && <p className="mt-2 text-sm text-destructive">{fieldErrors.lines}</p>}
          {overLimit > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" />
              <p>
                This takes <span className="font-medium">{customer?.label}</span> {formatMoney(overLimit)} over their credit limit of {formatMoney(cr!.creditLimit)}. You can still
                save it.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {kind === "quotation" && (
            <Field label="Terms & conditions" htmlFor="terms">
              <Textarea id="terms" value={v.terms} onChange={(e) => set("terms", e.target.value)} rows={3} placeholder="e.g. 50% advance, delivery in 7 days" />
            </Field>
          )}
          <Field label={kind === "quotation" ? "Notes" : "Notes (printed on the document)"} htmlFor="notes" className={kind === "quotation" ? "" : "lg:col-span-2"}>
            <Textarea id="notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <FormActionBar>
        <p className="mr-auto text-sm text-muted-foreground">
          Total <span className="tabular text-base font-semibold text-foreground">{formatMoney(totals.total)}</span>
        </p>
        <Button type="button" variant="outline" asChild>
          <Link href={v.id ? `${copy.base}/${v.id}` : copy.base}>Cancel</Link>
        </Button>
        {kind === "quotation" ? (
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save quotation
          </Button>
        ) : (
          <>
            <Button type="submit" variant={kind === "invoice" && !canPost ? "default" : "outline"} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save draft
            </Button>
            {(kind === "order" || canPost) && (
              <Button type="button" disabled={pending} onClick={() => save("final")}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {kind === "invoice" ? "Save & post" : "Save & confirm"}
              </Button>
            )}
          </>
        )}
      </FormActionBar>
    </form>
  );
}
