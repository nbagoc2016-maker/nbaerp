"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { LineItemsEditor, toLinePayload, type DocLinesValue, type ProductOption } from "@/components/app/line-items-editor";
import { useAction } from "@/components/app/use-action";
import { saveAndApprovePurchaseOrder, savePurchaseOrderAction } from "@/app/(app)/purchasing/orders/actions";
import { Field, FormActions } from "./field";

export interface OrderFormValue {
  id?: string | null;
  date: string;
  expectedDate: string;
  supplierId: string | null;
  warehouseId: string | null;
  terms: string;
  notes: string;
  doc: DocLinesValue;
}

export function OrderForm({
  initial,
  suppliers,
  warehouses,
  products,
  canApprove,
}: {
  initial: OrderFormValue;
  suppliers: (ComboOption & { paymentTermsDays: number })[];
  warehouses: ComboOption[];
  products: ProductOption[];
  canApprove: boolean;
}) {
  const [v, setV] = useState(initial);
  const { run, pending, fieldErrors } = useAction();
  const set = <K extends keyof OrderFormValue>(k: K, value: OrderFormValue[K]) => setV((s) => ({ ...s, [k]: value }));

  const pickSupplier = (id: string | null) => {
    const sp = suppliers.find((s) => s.value === id);
    setV((s) => ({
      ...s,
      supplierId: id,
      // Suggest the supplier's payment terms when none are written yet
      terms: s.terms || !sp ? s.terms : sp.paymentTermsDays ? `Payment within ${sp.paymentTermsDays} days of invoice` : "Payment on delivery",
    }));
  };

  const payload = () => ({
    id: v.id ?? null,
    date: v.date,
    expectedDate: v.expectedDate || null,
    supplierId: v.supplierId ?? "",
    warehouseId: v.warehouseId ?? "",
    terms: v.terms,
    notes: v.notes,
    ...toLinePayload(v.doc),
  });

  const save = (approve: boolean) =>
    run(() => (approve ? saveAndApprovePurchaseOrder(payload()) : savePurchaseOrderAction(payload())), {
      success: approve ? "Purchase order approved" : "Draft saved",
      redirectTo: (d) => `/purchasing/orders/${d.id}`,
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
          <CardTitle>Order details</CardTitle>
          <CardDescription>Who you are ordering from and where the goods should be delivered.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supplier" error={fieldErrors.supplierId} required className="sm:col-span-2">
            <Combobox options={suppliers} value={v.supplierId} onChange={pickSupplier} placeholder="Choose supplier…" searchPlaceholder="Name, code or phone" />
          </Field>
          <Field label="Deliver to" error={fieldErrors.warehouseId} required className="sm:col-span-2">
            <Combobox options={warehouses} value={v.warehouseId} onChange={(id) => set("warehouseId", id)} placeholder="Choose warehouse…" />
          </Field>
          <Field label="Order date" htmlFor="date" error={fieldErrors.date} required>
            <Input id="date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Expected delivery" htmlFor="expectedDate" error={fieldErrors.expectedDate}>
            <Input id="expectedDate" type="date" value={v.expectedDate} min={v.date} onChange={(e) => set("expectedDate", e.target.value)} />
          </Field>
          <Field label="Terms" htmlFor="terms" className="sm:col-span-2">
            <Input id="terms" value={v.terms} onChange={(e) => set("terms", e.target.value)} placeholder="Payment and delivery terms printed on the order" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Costs default to the last purchase price. Freight is the supplier&apos;s delivery charge on this order.</CardDescription>
        </CardHeader>
        <CardContent>
          <LineItemsEditor mode="purchase" products={products} value={v.doc} onChange={(doc) => set("doc", doc)} />
          {fieldErrors.lines && <p className="mt-2 text-sm text-destructive">{fieldErrors.lines}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Instructions for the supplier (quality, packing, shade matching…)" />
        </CardContent>
      </Card>

      <FormActions>
        <Button type="button" variant="outline" asChild>
          <Link href={v.id ? `/purchasing/orders/${v.id}` : "/purchasing/orders"}>Cancel</Link>
        </Button>
        <Button type="submit" variant={canApprove ? "outline" : "default"} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save draft
        </Button>
        {canApprove && (
          <Button type="button" disabled={pending} onClick={() => save(true)}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save & approve
          </Button>
        )}
      </FormActions>
    </form>
  );
}
