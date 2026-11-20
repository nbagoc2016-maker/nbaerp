"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { saveEmployeeAction } from "@/app/(app)/hr/employees/actions";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, round2 } from "@/lib/format";
import { emptyEmployee, type EmployeeFormValues } from "./employee-values";
import { Field } from "./field";

const STATUS_LABELS = { active: "Active", on_leave: "On leave", resigned: "Resigned", terminated: "Terminated" } as const;

export function EmployeeForm({ initial, departments }: { initial?: EmployeeFormValues; departments: { id: string; name: string }[] }) {
  const [v, setV] = useState(() => initial ?? emptyEmployee());
  const { run, pending, fieldErrors } = useAction();
  const set = <K extends keyof EmployeeFormValues>(k: K) => (value: EmployeeFormValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const text = (k: keyof EmployeeFormValues) => ({
    id: k,
    value: (v[k] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value })),
    "aria-invalid": !!fieldErrors[k] || undefined,
  });
  const gross = round2(Number(v.basicSalary || 0) + Number(v.allowances || 0));
  const isEdit = !!v.id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        saveEmployeeAction({
          id: v.id ?? null,
          name: v.name,
          fatherName: v.fatherName,
          cnic: v.cnic,
          phone: v.phone,
          email: v.email,
          address: v.address,
          emergencyContact: v.emergencyContact,
          departmentId: v.departmentId || null,
          designation: v.designation,
          joinDate: v.joinDate,
          leaveDate: v.leaveDate || null,
          status: v.status,
          basicSalary: v.basicSalary || 0,
          allowances: v.allowances || 0,
          commissionPct: v.commissionPct || 0,
          bankName: v.bankName,
          bankAccount: v.bankAccount,
          notes: v.notes,
        }),
      { success: (d) => (isEdit ? "Employee updated" : `Employee ${d.code} added`), redirectTo: (d) => `/hr/employees/${d.id}` }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>{isEdit ? `Employee code ${v.code}` : "The employee code is assigned automatically."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
            <Input {...text("name")} autoFocus={!isEdit} placeholder="e.g. Ayesha Khan" />
          </Field>
          <Field label="Father's name" htmlFor="fatherName" error={fieldErrors.fatherName}>
            <Input {...text("fatherName")} />
          </Field>
          <Field label="CNIC" htmlFor="cnic" error={fieldErrors.cnic}>
            <Input {...text("cnic")} placeholder="35202-1234567-1" inputMode="numeric" />
          </Field>
          <Field label="Phone" htmlFor="phone" error={fieldErrors.phone}>
            <Input {...text("phone")} placeholder="0300-1234567" inputMode="tel" />
          </Field>
          <Field label="Email" htmlFor="email" error={fieldErrors.email}>
            <Input {...text("email")} type="email" />
          </Field>
          <Field label="Emergency contact" htmlFor="emergencyContact" error={fieldErrors.emergencyContact}>
            <Input {...text("emergencyContact")} placeholder="Name and phone" />
          </Field>
          <Field label="Address" htmlFor="address" error={fieldErrors.address} className="sm:col-span-2 lg:col-span-3">
            <Textarea {...text("address")} rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Department" htmlFor="departmentId" error={fieldErrors.departmentId}>
            <Select value={v.departmentId || "none"} onValueChange={(x) => set("departmentId")(x === "none" ? "" : x)}>
              <SelectTrigger id="departmentId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No department</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Designation" htmlFor="designation" error={fieldErrors.designation}>
            <Input {...text("designation")} placeholder="e.g. Sales Associate" />
          </Field>
          <Field label="Status" htmlFor="status" error={fieldErrors.status}>
            <Select value={v.status} onValueChange={(x) => set("status")(x as EmployeeFormValues["status"])}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Joining date" htmlFor="joinDate" error={fieldErrors.joinDate}>
            <Input {...text("joinDate")} type="date" />
          </Field>
          <Field label="Leaving date" htmlFor="leaveDate" error={fieldErrors.leaveDate} hint="Leave blank while employed">
            <Input {...text("leaveDate")} type="date" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pay</CardTitle>
          <CardDescription>Monthly amounts. Payroll deducts absent days from basic + allowances.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Basic salary" htmlFor="basicSalary" error={fieldErrors.basicSalary}>
            <Input {...text("basicSalary")} type="number" min={0} step="any" inputMode="decimal" className="tabular text-right" />
          </Field>
          <Field label="Allowances" htmlFor="allowances" error={fieldErrors.allowances}>
            <Input {...text("allowances")} type="number" min={0} step="any" inputMode="decimal" className="tabular text-right" />
          </Field>
          <Field label="Commission %" htmlFor="commissionPct" error={fieldErrors.commissionPct} hint="For reference when entering commission in payroll">
            <Input {...text("commissionPct")} type="number" min={0} max={100} step="any" inputMode="decimal" className="tabular text-right" />
          </Field>
          <Field label="Bank name" htmlFor="bankName" error={fieldErrors.bankName}>
            <Input {...text("bankName")} placeholder="e.g. Meezan Bank" />
          </Field>
          <Field label="Bank account / IBAN" htmlFor="bankAccount" error={fieldErrors.bankAccount}>
            <Input {...text("bankAccount")} />
          </Field>
          <div className="flex flex-col justify-end rounded-lg bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">Gross monthly salary</p>
            <p className="tabular text-lg font-semibold">{formatMoney(gross)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea {...text("notes")} rows={3} placeholder="Anything HR should remember" />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <Button variant="outline" asChild>
          <Link href={isEdit ? `/hr/employees/${v.id}` : "/hr/employees"}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isEdit ? "Save changes" : "Add employee"}
        </Button>
      </div>
    </form>
  );
}
