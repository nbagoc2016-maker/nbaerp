"use client";

import { useState } from "react";
import { Loader2, Lock, LockOpen, TriangleAlert } from "lucide-react";
import { setBooksLockDate } from "@/app/(app)/accounting/statements/actions";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, formatDate, today } from "@/lib/format";
import { STATEMENT_TABS } from "@/server/services/finance-shared";
import { useSetParams } from "./url-filters";


export function StatementTabs({ value }: { value: string }) {
  const set = useSetParams();
  return (
    <Tabs value={value} onValueChange={(v) => set({ tab: v })}>
      <TabsList className="h-auto w-full flex-wrap sm:w-fit">
        {STATEMENT_TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="px-3">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function CompareToggle({ on }: { on: boolean }) {
  const set = useSetParams();
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Switch checked={on} onCheckedChange={(v) => set({ compare: v ? "1" : null })} />
      Compare with previous period
    </label>
  );
}

/** "Books closed up to …" — sets company.lockDate; postings on or before it are refused. */
export function CloseBooksCard({ lockDate }: { lockDate: string | null }) {
  const [date, setDate] = useState(lockDate ?? addDays(today(), -1));
  const [confirm, setConfirm] = useState<"close" | "reopen" | null>(null);
  const { run, pending, fieldErrors } = useAction();
  const yesterday = addDays(today(), -1);

  const apply = async (value: string | null) => {
    const res = await run(() => setBooksLockDate({ lockDate: value }), { success: value ? `Books closed up to ${formatDate(value)}` : "Books reopened" });
    if (res.ok) setConfirm(null);
  };

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {lockDate ? <Lock className="size-4 text-primary" /> : <LockOpen className="size-4 text-muted-foreground" />}
          Close books
        </CardTitle>
        <CardDescription>
          {lockDate ? (
            <>
              Books are closed up to <strong className="text-foreground">{formatDate(lockDate, "long")}</strong>. Nothing can be posted or voided on or before that date.
            </>
          ) : (
            "Books are open. Close a period once it's reconciled and reported, so nobody can change it by accident."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="lock-date">Close books up to</Label>
          <Input id="lock-date" type="date" value={date} max={yesterday} onChange={(e) => setDate(e.target.value)} className="w-44" />
          {fieldErrors.lockDate && <p className="text-xs text-destructive">{fieldErrors.lockDate}</p>}
        </div>
        <Button onClick={() => setConfirm("close")} disabled={pending || !date || date === lockDate || date > yesterday}>
          <Lock className="size-4" />
          {lockDate && date < lockDate ? "Move lock date back" : "Close books"}
        </Button>
        {lockDate && (
          <Button variant="outline" onClick={() => setConfirm("reopen")} disabled={pending}>
            <LockOpen className="size-4" />
            Reopen all
          </Button>
        )}
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-warning" />
              {confirm === "reopen" ? "Reopen the books?" : `Close books up to ${formatDate(date, "long")}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reopen"
                ? "Every past period becomes editable again: invoices, payments, expenses and journals dated in closed periods could be posted or voided, changing reports you may already have filed."
                : "No one will be able to post, edit or void anything dated on or before this date — sales, purchases, stock, payroll or journals. Make sure the period is reconciled and reported first. An accountant can reopen it later if needed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant={confirm === "reopen" ? "destructive" : "default"} disabled={pending} onClick={() => apply(confirm === "reopen" ? null : date)}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {confirm === "reopen" ? "Reopen books" : "Close books"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
