"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
import { removeAccount, setAccountStatus } from "@/app/(app)/accounting/accounts/actions";
import { useAction } from "@/components/app/use-action";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_LABELS, SUBTYPE_LABELS } from "@/server/services/finance-shared";
import { AccountDialog, type AccountDialogState, type CoaNode } from "./account-dialog";
import { Amount } from "./amount";

export function AccountsTree({ nodes, canManage, startNew }: { nodes: CoaNode[]; canManage: boolean; startNew?: boolean }) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<AccountDialogState>(startNew && canManage ? { mode: "create" } : null);
  const [toDelete, setToDelete] = useState<CoaNode | null>(null);
  const { run, pending } = useAction();
  const router = useRouter();
  const closeDialog = () => {
    setDialog(null);
    if (startNew) router.replace("/accounting/accounts");
  };

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Visible rows: search matches plus their ancestors; collapsed groups hide their descendants
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const keep = new Set<string>();
    for (const n of nodes) {
      if (!showInactive && !n.isActive) continue;
      const hit = !q || n.code.includes(q) || n.name.toLowerCase().includes(q) || (n.subtype && SUBTYPE_LABELS[n.subtype].toLowerCase().includes(q));
      if (!hit) continue;
      let cur: CoaNode | undefined = n;
      while (cur) {
        keep.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    }
    const hiddenByCollapse = (n: CoaNode) => {
      if (q) return false;
      let p = n.parentId ? byId.get(n.parentId) : undefined;
      while (p) {
        if (collapsed.has(p.id)) return true;
        p = p.parentId ? byId.get(p.parentId) : undefined;
      }
      return false;
    };
    return nodes.filter((n) => keep.has(n.id) && !hiddenByCollapse(n));
  }, [nodes, byId, query, showInactive, collapsed]);

  const roots = visible.filter((n) => n.depth === 0);
  const sections = roots.map((root) => {
    const rows: CoaNode[] = [];
    const startIdx = visible.indexOf(root);
    for (let i = startIdx + 1; i < visible.length && visible[i].depth > 0; i++) rows.push(visible[i]);
    return { root, rows };
  });

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code, name or subtype…" className="h-9 pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Show inactive
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
            Expand all
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set(nodes.filter((n) => n.isGroup && n.depth > 0).map((n) => n.id)))}>
            Collapse all
          </Button>
        </div>
      </div>

      {sections.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No accounts match “{query}”.</p>}

      {sections.map(({ root, rows }) => (
        <Card key={root.id} className="gap-0 overflow-hidden py-0">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{root.code}</span>
              <span className="font-semibold">{root.name}</span>
              <span className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[root.type]}</span>
            </div>
            <div className="flex items-center gap-2">
              <Amount value={root.balance} className="font-semibold" />
              {canManage && (
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Add account under ${root.name}`} onClick={() => setDialog({ mode: "create", parentId: root.id })}>
                  <Plus className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <tbody>
                {rows.map((n) => (
                  <tr key={n.id} className={cn("border-b last:border-0 hover:bg-muted/30", !n.isActive && "text-muted-foreground")}>
                    <td className="w-20 py-2 pl-4 font-mono text-xs text-muted-foreground">{n.code}</td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1" style={{ paddingLeft: `${(n.depth - 1) * 1.25}rem` }}>
                        {n.isGroup ? (
                          <button type="button" onClick={() => toggle(n.id)} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label={collapsed.has(n.id) ? "Expand" : "Collapse"}>
                            {collapsed.has(n.id) ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        {n.isGroup ? (
                          <span className="font-semibold">{n.name}</span>
                        ) : (
                          <Link href={`/accounting/ledger?account=${n.id}`} className="hover:text-primary hover:underline">
                            {n.name}
                          </Link>
                        )}
                        {n.isSystem && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">System</span>}
                        {!n.isActive && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">Inactive</span>}
                      </div>
                    </td>
                    <td className="hidden py-2 pr-2 text-xs text-muted-foreground sm:table-cell">{n.subtype ? SUBTYPE_LABELS[n.subtype] : n.isGroup ? "Group" : ""}</td>
                    <td className={cn("py-2 pr-2 text-right", n.isGroup && "font-semibold")}>
                      <Amount value={n.balance} muteZero={!n.isGroup} />
                    </td>
                    <td className="w-12 py-1 pr-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" aria-label="Account actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!n.isGroup && (
                            <DropdownMenuItem asChild>
                              <Link href={`/accounting/ledger?account=${n.id}`}>View ledger</Link>
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <>
                              <DropdownMenuItem onSelect={() => setDialog({ mode: "edit", node: n })}>Edit</DropdownMenuItem>
                              {n.isGroup && <DropdownMenuItem onSelect={() => setDialog({ mode: "create", parentId: n.id })}>Add account under it</DropdownMenuItem>}
                              {!n.isSystem && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={pending}
                                    onSelect={() =>
                                      run(() => setAccountStatus({ id: n.id, active: !n.isActive }), { success: n.isActive ? "Account deactivated" : "Account reactivated" })
                                    }
                                  >
                                    {n.isActive ? "Deactivate" : "Reactivate"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    disabled={n.hasPostings || n.hasChildren}
                                    onSelect={() => setToDelete(n)}
                                  >
                                    Delete{n.hasPostings ? " (has postings)" : n.hasChildren ? " (has accounts)" : ""}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-muted-foreground" colSpan={5}>
                      No accounts in this group yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <AccountDialog state={dialog} onClose={closeDialog} nodes={nodes} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.code} · {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This account has never been used, so it can be removed completely. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (!toDelete) return;
                const res = await run(() => removeAccount({ id: toDelete.id }), { success: "Account deleted" });
                if (res.ok) setToDelete(null);
              }}
            >
              Delete account
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
