"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { saveCustomer } from "@/app/(app)/sales/customers/actions";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { today } from "@/lib/format";
import { Field, FormActionBar } from "./common";

export interface CustomerFormValue {
  id?: string;
  name: string;
  type: "retail" | "wholesale" | "corporate";
  priceLevel: "retail" | "wholesale";
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

export const emptyCustomer = (): CustomerFormValue => ({
  name: "",
  type: "retail",
  priceLevel: "retail",
  contactPerson: "",
  phone: "",
  altPhone: "",
  email: "",
  address: "",
  city: "",
  taxNumber: "",
  cnic: "",
  paymentTermsDays: 0,
  creditLimit: 0,
  openingBalance: 0,
  openingDate: today(),
  notes: "",
  isActive: true,
});

export function CustomerForm({ initial, openingLocked }: { initial?: CustomerFormValue; openingLocked?: boolean }) {
  const [v, setV] = useState<CustomerFormValue>(initial ?? emptyCustomer());
  const { run, pending, fieldErrors } = useAction();
  const set = <K extends keyof CustomerFormValue>(k: K, val: CustomerFormValue[K]) => setV((p) => ({ ...p, [k]: val }));
  const cancelHref = v.id ? `/sales/customers/${v.id}` : "/sales/customers";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => saveCustomer(v), {
      success: v.id ? "Customer updated" : "Customer added",
      redirectTo: (d) => `/sales/customers/${d.id}`,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
          <CardDescription>Who you sell to and how to reach them.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" htmlFor="name" required error={fieldErrors.name} className="sm:col-span-2 lg:col-span-1">
            <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} autoFocus placeholder="e.g. Ayesha Boutique" />
          </Field>
          <Field label="Customer type" htmlFor="type">
            <Select
              value={v.type}
              onValueChange={(val) => {
                const type = val as CustomerFormValue["type"];
                setV((p) => ({ ...p, type, priceLevel: type === "wholesale" ? "wholesale" : p.priceLevel }));
              }}
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="wholesale">Wholesale</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Price list" htmlFor="priceLevel" hint="Wholesale customers get wholesale prices by default.">
            <Select value={v.priceLevel} onValueChange={(val) => set("priceLevel", val as CustomerFormValue["priceLevel"])}>
              <SelectTrigger id="priceLevel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail prices</SelectItem>
                <SelectItem value="wholesale">Wholesale prices</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contact person" htmlFor="contactPerson">
            <Input id="contactPerson" value={v.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
            <Input id="phone" type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="03xx-xxxxxxx" />
          </Field>
          <Field label="Other phone" htmlFor="altPhone">
            <Input id="altPhone" type="tel" value={v.altPhone} onChange={(e) => set("altPhone", e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="email" error={fieldErrors.email}>
            <Input id="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" value={v.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Address" htmlFor="address" className="sm:col-span-2 lg:col-span-1">
            <Input id="address" value={v.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="NTN / STRN" htmlFor="taxNumber">
            <Input id="taxNumber" value={v.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} />
          </Field>
          <Field label="CNIC" htmlFor="cnic">
            <Input id="cnic" value={v.cnic} onChange={(e) => set("cnic", e.target.value)} placeholder="xxxxx-xxxxxxx-x" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit & balance</CardTitle>
          <CardDescription>Payment terms set invoice due dates; sales over the credit limit show a warning.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Payment terms (days)" htmlFor="terms" error={fieldErrors.paymentTermsDays} hint="0 = due on the invoice date">
            <Input id="terms" type="number" min={0} step={1} value={v.paymentTermsDays} onChange={(e) => set("paymentTermsDays", Number(e.target.value) || 0)} className="tabular" />
          </Field>
          <Field label="Credit limit" htmlFor="creditLimit" error={fieldErrors.creditLimit} hint="0 = no limit">
            <Input id="creditLimit" type="number" min={0} step="0.01" value={v.creditLimit || ""} onChange={(e) => set("creditLimit", Number(e.target.value) || 0)} className="tabular" />
          </Field>
          <Field
            label="Opening balance owed"
            htmlFor="openingBalance"
            error={fieldErrors.openingBalance}
            hint={openingLocked ? "Already posted to the books" : "What they owed before you started using Shusui"}
          >
            <Input
              id="openingBalance"
              type="number"
              min={0}
              step="0.01"
              value={v.openingBalance || ""}
              disabled={openingLocked}
              onChange={(e) => set("openingBalance", Number(e.target.value) || 0)}
              className="tabular"
            />
          </Field>
          <Field label="Opening balance date" htmlFor="openingDate">
            <Input id="openingDate" type="date" value={v.openingDate} disabled={openingLocked} onChange={(e) => set("openingDate", e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-3">
            <Textarea id="notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
          <div className="flex items-center gap-3 pt-6">
            <Switch id="isActive" checked={v.isActive} onCheckedChange={(c) => set("isActive", c)} />
            <label htmlFor="isActive" className="text-sm">
              Active
            </label>
          </div>
        </CardContent>
      </Card>

      <FormActionBar>
        <Button type="button" variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {v.id ? "Save changes" : "Add customer"}
        </Button>
      </FormActionBar>
    </form>
  );
}
