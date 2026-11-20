"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, KeyRound, Loader2, Pencil, ShieldCheck, UserPlus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { addUser, editUser, resetPassword } from "@/app/(app)/settings/users/actions";
import type { RoleRow, UserRow } from "@/server/queries/admin-core";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function PasswordInput({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div>
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" className="font-mono" aria-invalid={!!error} />
        <Button type="button" variant="outline" size="icon" onClick={() => onChange(tempPassword())} title="Generate a password" aria-label="Generate a password">
          <Wand2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!value}
          onClick={() => navigator.clipboard?.writeText(value).then(() => toast.success("Password copied"))}
          title="Copy"
          aria-label="Copy password"
        >
          <Copy className="size-4" />
        </Button>
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : <p className="mt-1 text-xs text-muted-foreground">At least 8 characters. Share it privately; they can change it from their profile.</p>}
    </div>
  );
}

function RoleSelect({ id, roles, value, onChange, disabled }: { id: string; roles: RoleRow[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserDialog({ open, onOpenChange, user, roles, meId }: { open: boolean; onOpenChange: (o: boolean) => void; user: UserRow | null; roles: RoleRow[]; meId: string }) {
  const editing = !!user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [roleId, setRoleId] = useState(user?.roleId ?? roles.find((r) => !r.isAdmin)?.id ?? roles[0]?.id ?? "");
  const [isActive, setActive] = useState(user?.isActive ?? true);
  const [password, setPassword] = useState(() => (user ? "" : tempPassword()));
  const { run, pending, fieldErrors } = useAction();
  const isMe = user?.id === meId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = editing
      ? await run(() => editUser({ id: user.id, name, email, roleId, isActive }), { success: "User updated" })
      : await run(() => addUser({ name, email, roleId, password, isActive }), { success: `${name} can now sign in` });
    if (res.ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${user.name}` : "New user"}</DialogTitle>
            <DialogDescription>{editing ? "Change their name, email, role or access." : "They sign in with this email and the temporary password."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="u-name" className="mb-1.5">
                Full name
              </Label>
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} required aria-invalid={!!fieldErrors.name} />
              {fieldErrors.name && <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>}
            </div>
            <div>
              <Label htmlFor="u-email" className="mb-1.5">
                Email
              </Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={!!fieldErrors.email} />
              {fieldErrors.email && <p className="mt-1 text-xs text-destructive">{fieldErrors.email}</p>}
            </div>
            <div>
              <Label htmlFor="u-role" className="mb-1.5">
                Role
              </Label>
              <RoleSelect id="u-role" roles={roles} value={roleId} onChange={setRoleId} />
              {fieldErrors.roleId && <p className="mt-1 text-xs text-destructive">{fieldErrors.roleId}</p>}
            </div>
            {!editing && (
              <div>
                <Label htmlFor="u-pass" className="mb-1.5">
                  Temporary password
                </Label>
                <PasswordInput id="u-pass" value={password} onChange={setPassword} error={fieldErrors.password} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div>
                <Label htmlFor="u-active">Active</Label>
                <p className="text-xs text-muted-foreground">{isMe ? "You can't deactivate your own account." : "Inactive users can't sign in."}</p>
              </div>
              <Switch id="u-active" checked={isActive} onCheckedChange={setActive} disabled={isMe} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name || !email || !roleId}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onOpenChange }: { user: UserRow | null; onOpenChange: (o: boolean) => void }) {
  const [password, setPassword] = useState(tempPassword);
  const { run, pending, fieldErrors } = useAction();
  if (!user) return null;
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await run(() => resetPassword({ id: user.id, password }), { success: `New password set for ${user.name}` });
            if (res.ok) onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new temporary password for <span className="font-medium text-foreground">{user.name}</span>. They&apos;ll be signed out of their other devices.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="r-pass" className="mb-1.5">
              New password
            </Label>
            <PasswordInput id="r-pass" value={password} onChange={setPassword} error={fieldErrors.password} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || password.length < 8}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPanel({ users, roles, meId }: { users: UserRow[]; roles: RoleRow[]; meId: string }) {
  const [editing, setEditing] = useState<UserRow | null | "new">(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  const columns: ColumnDef<UserRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "User",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(row.original.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium">
              {row.original.name}
              {row.original.id === meId && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">You</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    { accessorKey: "email", header: "Email", meta: { className: "hidden" }, cell: () => null },
    {
      accessorKey: "roleName",
      header: "Role",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5">
          {row.original.isAdmin && <ShieldCheck className="size-3.5 text-primary" />}
          {row.original.roleName}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ getValue }) => <StatusBadge status={getValue() ? "active" : "inactive"} />,
      meta: { csv: (r: unknown) => ((r as UserRow).isActive ? "Active" : "Inactive") },
    },
    {
      accessorKey: "lastLoginAt",
      header: "Last sign-in",
      cell: ({ getValue }) => (getValue() ? <span className="whitespace-nowrap">{formatDateTime(String(getValue()))}</span> : <span className="text-muted-foreground">Never</span>),
    },
    {
      id: "actions",
      header: "",
      meta: { align: "right" },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setResetting(row.original)}>
            <KeyRound className="size-4" />
            <span className="hidden lg:inline">Reset password</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(row.original)}>
            <Pencil className="size-4" />
            <span className="hidden lg:inline">Edit</span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={users}
        exportName="users"
        searchPlaceholder="Search users…"
        toolbar={
          <Button size="sm" onClick={() => setEditing("new")}>
            <UserPlus className="size-4" /> New user
          </Button>
        }
        emptyTitle="No users yet"
      />
      {editing && (
        <UserDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          user={editing === "new" ? null : editing}
          roles={roles}
          meId={meId}
        />
      )}
      <ResetPasswordDialog key={resetting?.id ?? "none"} user={resetting} onOpenChange={(o) => !o && setResetting(null)} />
    </>
  );
}
