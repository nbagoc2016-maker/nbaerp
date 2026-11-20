"use client";

import { useMemo, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import type { AccountSubtype, AccountType } from "@/db/schema/accounting";
import { saveAccount } from "@/app/(app)/accounting/accounts/actions";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_TYPE_LABELS, SUBTYPE_LABELS, subtypesFor } from "@/server/services/finance-shared";

export interface CoaNode {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype | null;
  parentId: string | null;
  isGroup: boolean;
  isSystem: boolean;
  isActive: boolean;
  description: string | null;
  depth: number;
  balance: number;
  hasPostings: boolean;
  hasChildren: boolean;
}

export type AccountDialogState = { mode: "create"; parentId?: string | null } | { mode: "edit"; node: CoaNode } | null;

function suggestCode(nodes: CoaNode[], parent: CoaNode | undefined) {
  if (!parent) return "";
  const used = new Set(nodes.map((n) => n.code));
  const base = Number(parent.code);
  const step = parent.code.endsWith("00") ? 10 : 1;
  const children = nodes.filter((n) => n.parentId === parent.id).map((n) => Number(n.code)).filter(Number.isFinite);
  let next = Math.max(base, ...children) + step;
  while (used.has(String(next))) next += step;
  return String(next);
}

export function AccountDialog({ state, onClose, nodes }: { state: AccountDialogState; onClose: () => void; nodes: CoaNode[] }) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">{state && <AccountForm key={state.mode === "edit" ? state.node.id : `new-${state.parentId ?? ""}`} state={state} onClose={onClose} nodes={nodes} />}</DialogContent>
    </Dialog>
  );
}

function AccountForm({ state, onClose, nodes }: { state: NonNullable<AccountDialogState>; onClose: () => void; nodes: CoaNode[] }) {
  const editing = state.mode === "edit" ? state.node : null;
  const groups = useMemo(() => nodes.filter((n) => n.isGroup && n.id !== editing?.id), [nodes, editing]);
  const initialParent = editing?.parentId ?? (state.mode === "create" ? (state.parentId ?? null) : null);
  const [parentId, setParentId] = useState<string | null>(initialParent);
  const parent = nodes.find((n) => n.id === parentId);
  const [code, setCode] = useState(editing?.code ?? suggestCode(nodes, parent));
  const [name, setName] = useState(editing?.name ?? "");
  const [isGroup, setIsGroup] = useState(editing?.isGroup ?? false);
  const [subtype, setSubtype] = useState<AccountSubtype | null>(editing?.subtype ?? null);
  const [description, setDescription] = useState(editing?.description ?? "");
  const { run, pending, fieldErrors } = useAction();

  const type: AccountType | undefined = parent?.type ?? editing?.type;
  const subtypeChoices = type ? subtypesFor(type) : [];
  const system = !!editing?.isSystem;
  const subtypeValid = !subtype || subtypeChoices.includes(subtype);

  const save = async () => {
    const res = await run(
      () =>
        saveAccount({
          id: editing?.id,
          parentId,
          code: code.trim(),
          name: name.trim(),
          isGroup,
          subtype: isGroup || !subtypeValid ? null : subtype,
          description: description.trim() || null,
        }),
      { success: editing ? "Account updated" : "Account created" }
    );
    if (res.ok) onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.code} · ${editing.name}` : "New account"}</DialogTitle>
        <DialogDescription>
          {system
            ? "This is a system account used by automatic postings. You can rename it, but its code, group and subtype stay fixed."
            : "Accounts take their type (asset, liability, …) from the group they sit under."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Group</Label>
          {editing && !editing.parentId ? (
            <Input value="Top level" disabled />
          ) : (
            <Select
              value={parentId ?? undefined}
              disabled={system}
              onValueChange={(v) => {
                setParentId(v);
                const p = nodes.find((n) => n.id === v);
                if (!editing) setCode(suggestCode(nodes, p));
                if (p && subtype && !subtypesFor(p.type).includes(subtype)) setSubtype(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    <span style={{ paddingLeft: `${g.depth * 0.75}rem` }}>
                      {g.code} · {g.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {type && <p className="text-xs text-muted-foreground">Type: {ACCOUNT_TYPE_LABELS[type]}</p>}
          {fieldErrors.parentId && <p className="text-xs text-destructive">{fieldErrors.parentId}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="acc-code">Code</Label>
          <Input id="acc-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" disabled={system} placeholder="e.g. 6210" />
          {fieldErrors.code && <p className="text-xs text-destructive">{fieldErrors.code}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-name">Name</Label>
          <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shop Rent" autoFocus />
          {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
        </div>

        {!editing && (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Header (group) account</p>
              <p className="text-xs text-muted-foreground">Groups only total the accounts under them; nothing is posted to them directly.</p>
            </div>
            <Switch checked={isGroup} onCheckedChange={setIsGroup} />
          </div>
        )}

        {!isGroup && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Subtype</Label>
            <Select value={subtype && subtypeValid ? subtype : "none"} onValueChange={(v) => setSubtype(v === "none" ? null : (v as AccountSubtype))} disabled={system || !type}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {subtypeChoices.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SUBTYPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.subtype && <p className="text-xs text-destructive">{fieldErrors.subtype}</p>}
            {!editing && (subtype === "cash" || subtype === "bank" || subtype === "petty_cash") && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {subtype === "petty_cash"
                  ? "A petty cash fund will be created for this account (set its float on the Petty Cash page)."
                  : "A Cash & Bank register will be created so it shows in the cash book and payment pickers."}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="acc-desc">Description</Label>
          <Textarea id="acc-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional — what should be posted here" />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending || !name.trim() || !code.trim() || (!parentId && !editing)}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {editing ? "Save changes" : "Create account"}
        </Button>
      </DialogFooter>
    </>
  );
}
