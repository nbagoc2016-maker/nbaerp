"use client";

import { useState } from "react";
import { Building2, Loader2, Save } from "lucide-react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveCompany } from "@/app/(app)/settings/company/actions";

export interface CompanyValues {
  name: string;
  legalName: string;
  tagline: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string;
  currency: string;
  currencySymbol: string;
  fiscalYearStartMonth: number;
  invoiceFooter: string;
  logoUrl: string;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i, 1).toLocaleDateString("en-GB", { month: "long" }) }));

function Field({ id, label, error, hint, children, className }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">
        {label}
      </Label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CompanyForm({ initial, canEdit }: { initial: CompanyValues; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const { run, pending, fieldErrors } = useAction();
  const set = <K extends keyof CompanyValues>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const input = (k: keyof CompanyValues, props: React.ComponentProps<typeof Input> = {}) => (
    <Input id={`co-${k}`} value={String(v[k] ?? "")} onChange={set(k)} disabled={!canEdit} aria-invalid={!!fieldErrors[k]} {...props} />
  );
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveCompany(v), { success: "Company profile saved" });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" /> Company profile
          </CardTitle>
          <CardDescription>Shown on invoices, receipts, reports and the app header.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="co-name" label="Business name" error={fieldErrors.name}>
              {input("name", { required: true })}
            </Field>
            <Field id="co-legalName" label="Legal name" error={fieldErrors.legalName}>
              {input("legalName", { placeholder: "As registered" })}
            </Field>
            <Field id="co-tagline" label="Tagline" error={fieldErrors.tagline}>
              {input("tagline", { placeholder: "Printed under the name" })}
            </Field>
            <Field id="co-address" label="Address" error={fieldErrors.address} className="sm:col-span-2 lg:col-span-1">
              {input("address")}
            </Field>
            <Field id="co-city" label="City" error={fieldErrors.city}>
              {input("city")}
            </Field>
            <Field id="co-country" label="Country" error={fieldErrors.country}>
              {input("country")}
            </Field>
            <Field id="co-phone" label="Phone" error={fieldErrors.phone}>
              {input("phone", { type: "tel" })}
            </Field>
            <Field id="co-email" label="Email" error={fieldErrors.email}>
              {input("email", { type: "email" })}
            </Field>
            <Field id="co-website" label="Website" error={fieldErrors.website}>
              {input("website", { placeholder: "www.example.com" })}
            </Field>
            <Field id="co-taxNumber" label="Tax number (NTN / STRN)" error={fieldErrors.taxNumber}>
              {input("taxNumber")}
            </Field>
            <Field id="co-logoUrl" label="Logo URL" error={fieldErrors.logoUrl} hint="A https:// link or /path to an image" className="sm:col-span-2">
              {input("logoUrl", { placeholder: "https://…/logo.png" })}
            </Field>
          </div>

          <div className="grid gap-4 border-t pt-6 sm:grid-cols-3">
            <Field id="co-currency" label="Currency code" error={fieldErrors.currency}>
              {input("currency", { maxLength: 8, className: "uppercase" })}
            </Field>
            <Field id="co-currencySymbol" label="Currency symbol" error={fieldErrors.currencySymbol}>
              {input("currencySymbol", { maxLength: 8 })}
            </Field>
            <Field id="co-fy" label="Fiscal year starts in" error={fieldErrors.fiscalYearStartMonth}>
              <Select value={String(v.fiscalYearStartMonth)} onValueChange={(m) => setV((s) => ({ ...s, fiscalYearStartMonth: Number(m) }))} disabled={!canEdit}>
                <SelectTrigger id="co-fy" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="co-invoiceFooter" label="Invoice footer" error={fieldErrors.invoiceFooter} hint="Terms, bank details or a thank-you note printed at the bottom" className="sm:col-span-3">
              <Textarea id="co-invoiceFooter" rows={3} value={v.invoiceFooter} onChange={set("invoiceFooter")} disabled={!canEdit} />
            </Field>
          </div>
        </CardContent>
        {canEdit && (
          <CardFooter className="justify-end gap-2 border-t pt-4 [.border-t]:pt-4">
            <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={() => setV(initial)}>
              Discard changes
            </Button>
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save profile
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
  );
}
