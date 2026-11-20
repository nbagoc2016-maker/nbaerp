"use client";

import { useMemo, useState } from "react";
import { ChevronRight, FolderTree, Loader2, Pencil, Percent, Plus, Ruler, Star, Tag, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  deleteBrandAction,
  deleteCategoryAction,
  deleteTaxRateAction,
  deleteUnitAction,
  saveBrandAction,
  saveCategoryAction,
  saveTaxRateAction,
  saveUnitAction,
} from "@/app/(app)/inventory/setup/actions";
import { Field } from "./shared";

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  products: number;
}
interface Brand {
  id: string;
  name: string;
  products: number;
}
interface Unit {
  id: string;
  code: string;
  name: string;
  allowFraction: boolean;
  products: number;
}
interface TaxRate {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
  isActive: boolean;
  products: number;
}

const ROOT = "__root__";

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <li className={cn("flex items-center gap-3 px-4 py-2.5", className)}>{children}</li>;
}

function RowActions({ onEdit, del }: { onEdit: () => void; del: { title: string; inUse: number; run: () => ReturnType<typeof deleteBrandAction> } }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="ghost" className="size-8" aria-label="Edit" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <ConfirmButton
        variant="ghost"
        size="icon"
        destructive={false}
        title={del.title}
        description={del.inUse ? `It is used by ${del.inUse} product(s), so it can't be deleted until they are changed.` : "This can't be undone."}
        confirmLabel="Delete"
        success="Deleted"
        disabled={del.inUse > 0}
        onConfirm={del.run}
      >
        <Trash2 className="size-4" />
      </ConfirmButton>
    </div>
  );
}

function EditDialog({ open, onOpenChange, title, description, children, onSave, pending, canSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave: () => void;
  pending: boolean;
  canSave: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !canSave}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Categories ------------------------------------------------------------------------------

function CategoriesTab({ rows }: { rows: Category[] }) {
  const [edit, setEdit] = useState<{ id: string | null; name: string; parentId: string | null; description: string } | null>(null);
  const { run, pending, fieldErrors } = useAction();
  const children = useMemo(() => {
    const m = new Map<string | null, Category[]>();
    for (const c of rows) m.set(c.parentId ?? null, [...(m.get(c.parentId ?? null) ?? []), c]);
    return m;
  }, [rows]);
  // Ancestors-first ordering with depth, for the tree and the parent picker
  const flat = useMemo(() => {
    const out: (Category & { depth: number })[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const c of children.get(parent) ?? []) {
        out.push({ ...c, depth });
        if (depth < 10) walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    // orphans (parent deleted elsewhere)
    for (const c of rows) if (!out.some((o) => o.id === c.id)) out.push({ ...c, depth: 0 });
    return out;
  }, [children, rows]);

  const descendants = (id: string): Set<string> => {
    const s = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of rows) {
        if (c.parentId && s.has(c.parentId) && !s.has(c.id)) {
          s.add(c.id);
          grew = true;
        }
      }
    }
    return s;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Group products for filters and reports. Categories can sit inside other categories.</p>
        <Button size="sm" onClick={() => setEdit({ id: null, name: "", parentId: null, description: "" })}>
          <Plus className="size-4" />
          New category
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories yet" description="Create categories such as Fabric › Lawn or Accessories." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {flat.map((c) => (
              <Row key={c.id}>
                <span className="flex min-w-0 flex-1 items-center gap-1.5" style={{ paddingLeft: `${c.depth * 1.25}rem` }}>
                  {c.depth > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate font-medium">{c.name}</span>
                  {c.description && <span className="hidden truncate text-xs text-muted-foreground sm:inline">— {c.description}</span>}
                </span>
                <span className="text-xs text-muted-foreground tabular">{c.products} product(s)</span>
                <RowActions
                  onEdit={() => setEdit({ id: c.id, name: c.name, parentId: c.parentId, description: c.description ?? "" })}
                  del={{ title: `Delete category "${c.name}"?`, inUse: c.products + (children.get(c.id)?.length ?? 0), run: () => deleteCategoryAction({ id: c.id }) }}
                />
              </Row>
            ))}
          </ul>
        </Card>
      )}
      {edit && (
        <EditDialog
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={edit.id ? "Edit category" : "New category"}
          pending={pending}
          canSave={!!edit.name.trim()}
          onSave={() => run(() => saveCategoryAction(edit), { success: "Category saved", onSuccess: () => setEdit(null) })}
        >
          <Field label="Name" htmlFor="cat-name" error={fieldErrors.name}>
            <Input id="cat-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Parent category" error={fieldErrors.parentId}>
            <Select value={edit.parentId ?? ROOT} onValueChange={(p) => setEdit({ ...edit, parentId: p === ROOT ? null : p })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT}>None (top level)</SelectItem>
                {flat
                  .filter((c) => !edit.id || !descendants(edit.id).has(c.id))
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {"  ".repeat(c.depth)}
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description" htmlFor="cat-desc">
            <Textarea id="cat-desc" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </Field>
        </EditDialog>
      )}
    </div>
  );
}

// ---- Brands ----------------------------------------------------------------------------------

function BrandsTab({ rows }: { rows: Brand[] }) {
  const [edit, setEdit] = useState<{ id: string | null; name: string } | null>(null);
  const { run, pending, fieldErrors } = useAction();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manufacturers or labels you sell.</p>
        <Button size="sm" onClick={() => setEdit({ id: null, name: "" })}>
          <Plus className="size-4" />
          New brand
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Tag} title="No brands yet" description="Add brands such as Gul Ahmed or your house brand." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((b) => (
              <Row key={b.id}>
                <span className="flex-1 font-medium">{b.name}</span>
                <span className="text-xs text-muted-foreground tabular">{b.products} product(s)</span>
                <RowActions onEdit={() => setEdit({ id: b.id, name: b.name })} del={{ title: `Delete brand "${b.name}"?`, inUse: b.products, run: () => deleteBrandAction({ id: b.id }) }} />
              </Row>
            ))}
          </ul>
        </Card>
      )}
      {edit && (
        <EditDialog
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={edit.id ? "Edit brand" : "New brand"}
          pending={pending}
          canSave={!!edit.name.trim()}
          onSave={() => run(() => saveBrandAction(edit), { success: "Brand saved", onSuccess: () => setEdit(null) })}
        >
          <Field label="Name" htmlFor="brand-name" error={fieldErrors.name}>
            <Input id="brand-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
          </Field>
        </EditDialog>
      )}
    </div>
  );
}

// ---- Units -----------------------------------------------------------------------------------

function UnitsTab({ rows }: { rows: Unit[] }) {
  const [edit, setEdit] = useState<{ id: string | null; code: string; name: string; allowFraction: boolean } | null>(null);
  const { run, pending, fieldErrors } = useAction();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">How quantities are measured. Allow fractions for metres, yards or kilograms.</p>
        <Button size="sm" onClick={() => setEdit({ id: null, code: "", name: "", allowFraction: false })}>
          <Plus className="size-4" />
          New unit
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Ruler} title="No units yet" description="Add units such as pcs, m, yd or suit." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((u) => (
              <Row key={u.id}>
                <span className="w-16 font-semibold tabular">{u.code}</span>
                <span className="flex-1">{u.name}</span>
                <StatusBadge status={u.allowFraction ? "open" : "draft"}>{u.allowFraction ? "Fractions allowed" : "Whole numbers"}</StatusBadge>
                <span className="hidden text-xs text-muted-foreground tabular sm:inline">{u.products} product(s)</span>
                <RowActions
                  onEdit={() => setEdit({ id: u.id, code: u.code, name: u.name, allowFraction: u.allowFraction })}
                  del={{ title: `Delete unit "${u.code}"?`, inUse: u.products, run: () => deleteUnitAction({ id: u.id }) }}
                />
              </Row>
            ))}
          </ul>
        </Card>
      )}
      {edit && (
        <EditDialog
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={edit.id ? "Edit unit" : "New unit"}
          pending={pending}
          canSave={!!edit.code.trim() && !!edit.name.trim()}
          onSave={() => run(() => saveUnitAction(edit), { success: "Unit saved", onSuccess: () => setEdit(null) })}
        >
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <Field label="Code" htmlFor="unit-code" error={fieldErrors.code}>
              <Input id="unit-code" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toLowerCase() })} autoFocus placeholder="m" />
            </Field>
            <Field label="Name" htmlFor="unit-name" error={fieldErrors.name}>
              <Input id="unit-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Meter" />
            </Field>
          </div>
          <label htmlFor="unit-frac" className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
            <Switch id="unit-frac" checked={edit.allowFraction} onCheckedChange={(c) => setEdit({ ...edit, allowFraction: c })} />
            <span className="text-sm">Allow fractions (e.g. 2.5 m)</span>
          </label>
        </EditDialog>
      )}
    </div>
  );
}

// ---- Tax rates -------------------------------------------------------------------------------

function TaxTab({ rows }: { rows: TaxRate[] }) {
  const [edit, setEdit] = useState<{ id: string | null; name: string; rate: number; isDefault: boolean; isActive: boolean } | null>(null);
  const { run, pending, fieldErrors } = useAction();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Sales tax rates applied to products. One rate is the default for new products.</p>
        <Button size="sm" onClick={() => setEdit({ id: null, name: "", rate: 0, isDefault: false, isActive: true })}>
          <Plus className="size-4" />
          New tax rate
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Percent} title="No tax rates yet" description="Add your sales tax rates, e.g. GST 18%." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((t) => (
              <Row key={t.id} className={cn(!t.isActive && "opacity-60")}>
                <span className="flex flex-1 items-center gap-2 font-medium">
                  {t.name}
                  {t.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground dark:text-warning">
                      <Star className="size-3" />
                      Default
                    </span>
                  )}
                  {!t.isActive && <StatusBadge status="inactive" />}
                </span>
                <span className="w-16 text-right font-semibold tabular">{t.rate}%</span>
                <span className="hidden text-xs text-muted-foreground tabular sm:inline">{t.products} product(s)</span>
                <RowActions
                  onEdit={() => setEdit({ id: t.id, name: t.name, rate: t.rate, isDefault: t.isDefault, isActive: t.isActive })}
                  del={{ title: `Delete tax rate "${t.name}"?`, inUse: t.products, run: () => deleteTaxRateAction({ id: t.id }) }}
                />
              </Row>
            ))}
          </ul>
        </Card>
      )}
      {edit && (
        <EditDialog
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={edit.id ? "Edit tax rate" : "New tax rate"}
          pending={pending}
          canSave={!!edit.name.trim()}
          onSave={() => run(() => saveTaxRateAction(edit), { success: "Tax rate saved", onSuccess: () => setEdit(null) })}
        >
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Name" htmlFor="tax-name" error={fieldErrors.name}>
              <Input id="tax-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus placeholder="GST 18%" />
            </Field>
            <Field label="Rate %" htmlFor="tax-rate" error={fieldErrors.rate}>
              <Input id="tax-rate" type="number" min={0} max={100} step="0.01" value={edit.rate || ""} onChange={(e) => setEdit({ ...edit, rate: Number(e.target.value || 0) })} className="text-right tabular" />
            </Field>
          </div>
          <label htmlFor="tax-default" className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
            <Switch id="tax-default" checked={edit.isDefault} onCheckedChange={(c) => setEdit({ ...edit, isDefault: c, isActive: c ? true : edit.isActive })} />
            <span className="text-sm">Default for new products</span>
          </label>
          <label htmlFor="tax-active" className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
            <Switch id="tax-active" checked={edit.isActive} disabled={edit.isDefault} onCheckedChange={(c) => setEdit({ ...edit, isActive: c })} />
            <span className="text-sm">Active (shown in pickers)</span>
          </label>
        </EditDialog>
      )}
    </div>
  );
}

export function SetupTabs({ data, initialTab }: { data: { categories: Category[]; brands: Brand[]; units: Unit[]; taxRates: TaxRate[] }; initialTab: string }) {
  return (
    <Tabs defaultValue={initialTab}>
      <TabsList className="mb-2 h-auto flex-wrap">
        <TabsTrigger value="categories">
          <FolderTree className="size-4" />
          Categories ({data.categories.length})
        </TabsTrigger>
        <TabsTrigger value="brands">
          <Tag className="size-4" />
          Brands ({data.brands.length})
        </TabsTrigger>
        <TabsTrigger value="units">
          <Ruler className="size-4" />
          Units ({data.units.length})
        </TabsTrigger>
        <TabsTrigger value="tax">
          <Percent className="size-4" />
          Tax rates ({data.taxRates.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="categories">
        <CategoriesTab rows={data.categories} />
      </TabsContent>
      <TabsContent value="brands">
        <BrandsTab rows={data.brands} />
      </TabsContent>
      <TabsContent value="units">
        <UnitsTab rows={data.units} />
      </TabsContent>
      <TabsContent value="tax">
        <TaxTab rows={data.taxRates} />
      </TabsContent>
    </Tabs>
  );
}
