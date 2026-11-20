"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { Combobox } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { today } from "@/lib/format";
import { createCountAction } from "@/app/(app)/inventory/counts/actions";
import { Field } from "./shared";

export function NewCountForm({
  warehouses,
  categories,
  defaultWarehouseId,
}: {
  warehouses: { value: string; label: string }[];
  categories: { value: string; label: string }[];
  defaultWarehouseId: string;
}) {
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const { run, pending, fieldErrors } = useAction();

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>What are you counting?</CardTitle>
        <CardDescription>
          Starting the count freezes the current system quantity of every stock item in the warehouse. Count, enter what you find, then post: only the differences are adjusted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Warehouse" error={fieldErrors.warehouseId}>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Count date" htmlFor="date" error={fieldErrors.date}>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Category" hint="Leave empty to count everything" className="sm:col-span-2">
            <Combobox options={categories} value={categoryId} onChange={setCategoryId} placeholder="All categories" allowClear />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Team, area, year-end count…" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventory/counts">Cancel</Link>
          </Button>
          <Button
            disabled={pending || !warehouseId}
            onClick={() => run(() => createCountAction({ warehouseId, categoryId, date, notes }), { success: "Count started", redirectTo: (d) => `/inventory/counts/${d.id}` })}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
            Start count
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
