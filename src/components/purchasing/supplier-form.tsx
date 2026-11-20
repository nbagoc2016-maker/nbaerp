"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/app/use-action";
import { saveSupplier } from "@/app/(app)/purchasing/suppliers/actions";
import { Field, FormActions } from "./field";

export interface SupplierFormValue {
  id?: string | null;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  altPhone: string;
  email: string;
  address: string;
  city: string;
  taxNumber: string;
  cnic: string;
  paymentTermsDays: number;
  creditLimit: number;
  openingBalance: number;
  openingDate: string;
  notes: string;
  isActive: boolean;
}

export const emptySupplier = (): SupplierFormValue => ({
  code: "",
  name: "",
  contactPerson: "",
  phone: "",
  altPhone: "",
  email: "",
  address: "",
  city: "",
  taxNumber: "",
  cnic: "",
  paymentTermsDays: 30,
  creditLimit: 0,
  openingBalance: 0,
  openingDate: today(),
  notes: "",
  isActive: true,
});

// `initial` is omitted for a new supplier: the blank value is built here on the client, because
// server pages can't call emptySupplier() from this client module.
export function SupplierForm({ initial, hasOpeningJournal }: { initial?: SupplierFormValue; hasOpeningJournal?: boolean }) {
  const [v, setV] = useState(() => initial ?? emptySupplier());
  const { run, pending, fieldErrors } = useAction();
  const set = <K extends keyof SupplierFormValue>(k: K, value: SupplierFormValue[K]) => setV((s) => ({ ...s, [k]: value }));
  const text = (k: keyof SupplierFormValue) => ({
    id: k,
    value: String(v[k] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });
  const isEdit = !!v.id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => saveSupplier({ ...v, openingDate: v.openingDate || null }), {
      success: isEdit ? "Supplier updated" : "Supplier added",
      redirectTo: (d) => `/purchasing/suppliers/${d.id}`,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Supplier details</CardTitle>
          <CardDescription>Who you buy from and how to reach them.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" htmlFor="name" error={fieldErrors.name} required className="lg:col-span-2">
            <Input {...text("name")} placeholder="e.g. Gul Ahmed Textile Mills" autoFocus />
          </Field>
          <Field label="Code" htmlFor="code" error={fieldErrors.code} hint={isEdit ? undefined : "Leave blank to number automatically"}>
            <Input {...text("code")} placeholder="Auto" />
          </Field>
          <Field label="Contact person" htmlFor="contactPerson">
            <Input {...text("contactPerson")} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input {...text("phone")} inputMode="tel" />
          </Field>
          <Field label="Alternate phone" htmlFor="altPhone">
            <Input {...text("altPhone")} inputMode="tel" />
          </Field>
          <Field label="Email" htmlFor="email" error={fieldErrors.email}>
            <Input {...text("email")} type="email" />
          </Field>
          <Field label="City" htmlFor="city">
            <Input {...text("city")} />
          </Field>
          <Field label="NTN / STRN" htmlFor="taxNumber">
            <Input {...text("taxNumber")} />
          </Field>
          <Field label="Address" htmlFor="address" className="sm:col-span-2">
            <Input {...text("address")} />
          </Field>
          <Field label="CNIC" htmlFor="cnic">
            <Input {...text("cnic")} placeholder="xxxxx-xxxxxxx-x" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terms & balance</CardTitle>
          <CardDescription>Payment terms set the due date of new bills. The opening balance is what you owed them at go-live.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Payment terms (days)" htmlFor="paymentTermsDays" error={fieldErrors.paymentTermsDays} hint="0 = due on receipt">
            <Input
              id="paymentTermsDays"
              type="number"
              min={0}
              step={1}
              value={v.paymentTermsDays}
              onChange={(e) => set("paymentTermsDays", Number(e.target.value || 0))}
              className="tabular"
            />
          </Field>
          <Field label="Credit limit" htmlFor="creditLimit" error={fieldErrors.creditLimit}>
            <Input id="creditLimit" type="number" min={0} step="0.01" value={v.creditLimit || ""} onChange={(e) => set("creditLimit", Number(e.target.value || 0))} className="tabular" />
          </Field>
          <div className="hidden lg:block" />
          <Field
            label="Opening balance (we owe)"
            htmlFor="openingBalance"
            error={fieldErrors.openingBalance}
            hint={hasOpeningJournal ? "Changing it replaces the opening journal" : "Posted once: Dr Opening Balance Equity, Cr Payable"}
          >
            <Input
              id="openingBalance"
              type="number"
              min={0}
              step="0.01"
              value={v.openingBalance || ""}
              onChange={(e) => set("openingBalance", Number(e.target.value || 0))}
              className="tabular"
            />
          </Field>
          <Field label="Opening balance date" htmlFor="openingDate" error={fieldErrors.openingDate}>
            <Input id="openingDate" type="date" value={v.openingDate} onChange={(e) => set("openingDate", e.target.value)} />
          </Field>
          <Field label="Active" htmlFor="isActive" hint="Inactive suppliers are hidden from pickers">
            <div className="flex h-9 items-center">
              <Switch id="isActive" checked={v.isActive} onCheckedChange={(c) => set("isActive", c)} />
            </div>
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-3">
            <Textarea {...text("notes")} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <FormActions>
        <Button type="button" variant="outline" asChild>
          <Link href={isEdit ? `/purchasing/suppliers/${v.id}` : "/purchasing/suppliers"}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? "Save changes" : "Add supplier"}
        </Button>
      </FormActions>
    </form>
  );
}
