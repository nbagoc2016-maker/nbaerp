"use client";

import { useMemo, useState } from "react";
import { Loader2, Lock, Plus, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeRole, saveRole } from "@/app/(app)/settings/users/actions";
import type { RoleRow } from "@/server/queries/admin-core";

const TOTAL = PERMISSION_GROUPS.reduce((s, g) => s + g.permissions.length, 0);

function RoleEditor({ role, onSaved, onDeleted }: { role: RoleRow | null; onSaved: (id: string) => void; onDeleted: () => void }) {
  const locked = !!role?.isAdmin;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(() => new Set(role?.permissions ?? ["dashboard.view"]));
  const { run, pending, fieldErrors } = useAction();
  const has = (k: string) => locked || perms.has(k);

  const toggle = (keys: string[], on: boolean) =>
    setPerms((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const dirty =
    !role || name !== role.name || (description || "") !== (role.description || "") || perms.size !== role.permissions.length || role.permissions.some((p) => !perms.has(p));

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {locked ? <Lock className="size-4 text-muted-foreground" /> : <ShieldCheck className="size-4 text-muted-foreground" />}
          {role ? role.name : "New role"}
        </CardTitle>
        <CardDescription>
          {locked
            ? "The Administrator role always has full access to everything and can't be edited or deleted."
            : `${locked ? TOTAL : perms.size} of ${TOTAL} permissions selected${role ? ` · ${role.userCount} user${role.userCount === 1 ? "" : "s"}` : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="role-name" className="mb-1.5">
              Role name
            </Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} aria-invalid={!!fieldErrors.name} />
            {fieldErrors.name && <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>}
          </div>
          <div>
            <Label htmlFor="role-desc" className="mb-1.5">
              Description
            </Label>
            <Input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} placeholder="What this role is for" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {PERMISSION_GROUPS.map((g) => {
            const keys = g.permissions.map((p) => p.key as string);
            const on = keys.filter(has).length;
            const all = on === keys.length;
            return (
              <div key={g.module} className={cn("rounded-lg border", on > 0 && !locked && "border-primary/30")}>
                <label className="flex cursor-pointer items-center gap-3 border-b bg-muted/40 px-3 py-2">
                  <Checkbox
                    className="data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/50 data-[state=indeterminate]:text-primary-foreground"
                    checked={all ? true : on > 0 ? "indeterminate" : false}
                    onCheckedChange={(v) => toggle(keys, v === true)}
                    disabled={locked}
                    aria-label={`Select all ${g.label}`}
                  />
                  <span className="flex-1 text-sm font-medium">{g.label}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {on}/{keys.length}
                  </span>
                </label>
                <ul className="space-y-0.5 p-1.5">
                  {g.permissions.map((p) => (
                    <li key={p.key}>
                      <label className={cn("flex items-start gap-3 rounded-md px-1.5 py-1.5 text-sm", !locked && "cursor-pointer hover:bg-muted/60")}>
                        <Checkbox className="mt-0.5" checked={has(p.key)} onCheckedChange={(v) => toggle([p.key], v === true)} disabled={locked} />
                        <span className="min-w-0 flex-1">
                          {p.label}
                          <span className="block font-mono text-[11px] text-muted-foreground">{p.key}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </CardContent>
      {!locked && (
        <CardFooter className="flex-wrap justify-between gap-2 border-t pt-4 [.border-t]:pt-4">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPerms(new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key as string))))}>
              Select all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPerms(new Set())}>
              Clear
            </Button>
          </div>
          <div className="flex gap-2">
            {role && (
              <ConfirmButton
                destructive
                size="default"
                disabled={role.userCount > 0 || role.isSystem}
                title={`Delete the ${role.name} role?`}
                description="This can't be undone. Roles that still have users can't be deleted."
                confirmLabel="Delete role"
                success="Role deleted"
                onConfirm={async () => {
                  const res = await removeRole({ id: role.id });
                  if (res.ok) onDeleted();
                  return res;
                }}
              >
                <Trash2 className="size-4" /> Delete
              </ConfirmButton>
            )}
            <Button
              type="button"
              disabled={pending || !name.trim() || !dirty}
              onClick={async () => {
                const res = await run(() => saveRole({ id: role?.id ?? null, name, description, permissions: [...perms] }), { success: role ? "Role saved" : "Role created" });
                if (res.ok) onSaved(res.data.id);
              }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {role ? "Save role" : "Create role"}
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

export function RolesPanel({ roles }: { roles: RoleRow[] }) {
  const [selected, setSelected] = useState<string | "new">(() => roles.find((r) => !r.isAdmin)?.id ?? roles[0]?.id ?? "new");
  const role = useMemo(() => (selected === "new" ? null : (roles.find((r) => r.id === selected) ?? null)), [roles, selected]);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start" onClick={() => setSelected("new")}>
          <Plus className="size-4" /> New role
        </Button>
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {roles.map((r) => (
            <li key={r.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => setSelected(r.id)}
                className={cn(
                  "flex w-full min-w-48 items-start gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                  selected === r.id && "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                )}
              >
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", r.isAdmin ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {r.isAdmin ? <Lock className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" /> {r.userCount}
                    </span>
                    <span>·</span>
                    <span>{r.isAdmin ? "Full access" : `${r.permissions.length} permission${r.permissions.length === 1 ? "" : "s"}`}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        <RoleEditor
          key={role ? `${role.id}:${role.name}:${role.permissions.join(",")}` : "new"}
          role={role}
          onSaved={(id) => setSelected(id)}
          onDeleted={() => setSelected(roles.find((r) => !r.isAdmin && r.id !== role?.id)?.id ?? roles[0]?.id ?? "new")}
        />
      </div>
    </div>
  );
}
