"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteLocationAction, deleteWarehouseAction, saveLocationAction, saveWarehouseAction } from "@/app/(app)/inventory/warehouses/actions";
import { Field, WAREHOUSE_TYPES } from "./shared";

export interface WarehouseFormValue {
  id?: string | null;
  code: string;
  name: string;
  type: "warehouse" | "shop" | "transit" | "production_hall" | "gate_area" | "dispatch_area" | "distribution";
  address: string;
  phone: string;
  managerName: string;
  isDefault: boolean;
  isActive: boolean;
}

export function WarehouseForm({ initial, wasDefault }: { initial: WarehouseFormValue; wasDefault?: boolean }) {
  const [v, setV] = useState(initial);
  const { run, pending, fieldErrors } = useAction();
  const isEdit = !!v.id;
  const set = <K extends keyof WarehouseFormValue>(k: K, val: WarehouseFormValue[K]) => setV((c) => ({ ...c, [k]: val }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveWarehouseAction({ ...v, id: v.id ?? null }), {
          success: isEdit ? "Warehouse saved" : "Warehouse created",
          redirectTo: isEdit ? undefined : (d) => `/inventory/warehouses/${d.id}`,
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? "Warehouse details" : "New warehouse"}</CardTitle>
          <CardDescription>Warehouses, shops and transit locations all hold their own stock.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Code" htmlFor="wh-code" error={fieldErrors.code} hint="Short, e.g. MAIN or SHOP2">
              <Input id="wh-code" value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={20} required className="uppercase" />
            </Field>
            <Field label="Name" htmlFor="wh-name" error={fieldErrors.name} className="lg:col-span-2">
              <Input id="wh-name" value={v.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <Field label="Type">
              <Select value={v.type} onValueChange={(t) => set("type", t as WarehouseFormValue["type"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WAREHOUSE_TYPES).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Manager" htmlFor="wh-manager">
              <Input id="wh-manager" value={v.managerName} onChange={(e) => set("managerName", e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="wh-phone">
              <Input id="wh-phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
            </Field>
            <Field label="Address" htmlFor="wh-address" className="sm:col-span-2 lg:col-span-3">
              <Textarea id="wh-address" rows={2} value={v.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="wh-default" className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <Switch id="wh-default" checked={v.isDefault} disabled={wasDefault} onCheckedChange={(c) => set("isDefault", c)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Default warehouse</span>
                <span className="block text-xs text-muted-foreground">
                  {wasDefault ? "This is the default. Make another warehouse the default to change it." : "Pre-selected on new documents. Only one warehouse can be the default."}
                </span>
              </span>
            </label>
            <label htmlFor="wh-active" className="flex cursor-pointer items-start gap-3 rounded-xl border p-4">
              <Switch id="wh-active" checked={v.isActive || v.isDefault} disabled={v.isDefault} onCheckedChange={(c) => set("isActive", c)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Active</span>
                <span className="block text-xs text-muted-foreground">Inactive warehouses can&apos;t be used on new documents. They must be empty first.</span>
              </span>
            </label>
          </div>
          {fieldErrors.isDefault && <p className="text-xs text-destructive">{fieldErrors.isDefault}</p>}
          {fieldErrors.isActive && <p className="text-xs text-destructive">{fieldErrors.isActive}</p>}
          <div className="flex justify-end gap-2">
            {!isEdit && (
              <Button type="button" variant="outline" asChild>
                <Link href="/inventory/warehouses">Cancel</Link>
              </Button>
            )}
            <Button type="submit" disabled={pending || !v.code.trim() || !v.name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create warehouse"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

export function DeleteWarehouseButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton
      variant="outline"
      destructive
      title={`Delete ${name}?`}
      description="Only warehouses with no stock history or documents can be deleted. Otherwise, deactivate it."
      confirmLabel="Delete"
      success="Warehouse deleted"
      redirectTo="/inventory/warehouses"
      onConfirm={() => deleteWarehouseAction({ id })}
    >
      <Trash2 className="size-4" />
      Delete
    </ConfirmButton>
  );
}

interface LocationRow {
  id: string;
  code: string;
  name: string | null;
  isActive: boolean;
}

/** Bin / rack locations inside one warehouse, edited inline. */
export function LocationsManager({ warehouseId, locations, canEdit }: { warehouseId: string; locations: LocationRow[]; canEdit: boolean }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "" });
  const { run, pending } = useAction();

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="size-4 text-muted-foreground" />
          Bin locations
        </CardTitle>
        <CardDescription>Racks, shelves or bins inside this warehouse (optional).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {locations.length === 0 && <p className="py-2 text-sm text-muted-foreground">No bin locations yet.</p>}
        <ul className="divide-y">
          {locations.map((l) =>
            editing === l.id ? (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="h-8 w-28 uppercase" />
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 flex-1" placeholder="Description" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Save"
                  disabled={pending || !draft.code.trim()}
                  onClick={() =>
                    run(() => saveLocationAction({ id: l.id, warehouseId, code: draft.code, name: draft.name, isActive: l.isActive }), { success: "Location saved", onSuccess: () => setEditing(null) })
                  }
                >
                  <Check className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="Cancel" onClick={() => setEditing(null)}>
                  <X className="size-4" />
                </Button>
              </li>
            ) : (
              <li key={l.id} className="flex items-center gap-3 py-2">
                <span className="w-28 font-medium tabular">{l.code}</span>
                <span className="flex-1 truncate text-sm text-muted-foreground">{l.name}</span>
                {!l.isActive && <StatusBadge status="inactive" />}
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={l.isActive}
                      aria-label="Active"
                      onCheckedChange={(c) => run(() => saveLocationAction({ id: l.id, warehouseId, code: l.code, name: l.name, isActive: c }), { success: c ? "Location activated" : "Location deactivated" })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label="Edit"
                      onClick={() => {
                        setEditing(l.id);
                        setDraft({ code: l.code, name: l.name ?? "" });
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label="Delete"
                      disabled={pending}
                      onClick={() => run(() => deleteLocationAction({ id: l.id }), { success: "Location deleted" })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
        {canEdit && (
          <form
            className="flex flex-wrap gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveLocationAction({ warehouseId, code, name, isActive: true }), {
                success: "Location added",
                onSuccess: () => {
                  setCode("");
                  setName("");
                },
              });
            }}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code, e.g. A-01-03" className="h-9 w-40 uppercase" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Description (optional)" className="h-9 min-w-40 flex-1" />
            <Button type="submit" size="sm" className="h-9" disabled={pending || !code.trim()}>
              <Plus className="size-4" />
              Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
