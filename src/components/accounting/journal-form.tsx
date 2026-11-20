"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { saveJournal } from "@/app/(app)/accounting/journals/actions";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatMoney, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PartyType } from "@/server/services/finance-shared";

interface Line {
  key: number;
  accountId: string | null;
  debit: string;
  credit: string;
  partyType: PartyType | null;
  partyId: string | null;
  memo: string;
}

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
};

let seq = 0;
const blank = (): Line => ({ key: ++seq, accountId: null, debit: "", credit: "", partyType: null, partyId: null, memo: "" });

export function JournalForm({
  accounts,
  parties,
  defaultDate,
  lockDate,
}: {
  accounts: ComboOption[];
  parties: Record<PartyType, ComboOption[]>;
  defaultDate: string;
  lockDate: string | null;
}) {
  const [date, setDate] = useState(defaultDate);
  const [memo, setMemo] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => [blank(), blank()]);
  const { run, pending, fieldErrors } = useAction();

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const totalDebit = round2(lines.reduce((s, l) => s + num(l.debit), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + num(l.credit), 0));
  const difference = round2(totalDebit - totalCredit);
  const used = lines.filter((l) => num(l.debit) || num(l.credit));
  const missingAccount = used.some((l) => !l.accountId);
  const missingParty = used.some((l) => l.partyType && !l.partyId);
  const locked = !!lockDate && date <= lockDate;
  const canSave = !pending && used.length >= 2 && difference === 0 && totalDebit > 0 && !missingAccount && !missingParty && !!memo.trim() && !locked;

  const submit = () =>
    run(
      () =>
        saveJournal({
          date,
          memo: memo.trim(),
          isOpening,
          lines: used.map((l) => ({
            accountId: l.accountId!,
            debit: num(l.debit),
            credit: num(l.credit),
            partyType: l.partyType,
            partyId: l.partyType ? l.partyId : null,
            memo: l.memo.trim() || null,
          })),
        }),
      { success: (d) => `Journal ${d.number} posted`, redirectTo: (d) => `/accounting/journals/${d.id}` }
    );

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>Entry details</CardTitle>
          <CardDescription>Use manual journals for adjustments, accruals, depreciation and corrections. Debits must equal credits.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="je-date">Date</Label>
            <Input id="je-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {locked && <p className="text-xs text-destructive">Books are closed up to {formatDate(lockDate)}. Choose a later date.</p>}
            {fieldErrors.date && <p className="text-xs text-destructive">{fieldErrors.date}</p>}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="je-memo">Memo</Label>
            <Input id="je-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. October depreciation on equipment" />
            {fieldErrors.memo && <p className="text-xs text-destructive">{fieldErrors.memo}</p>}
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-3">
            <Checkbox checked={isOpening} onCheckedChange={(v) => setIsOpening(v === true)} className="mt-0.5" />
            <span>
              Opening balance entry
              <span className="block text-xs text-muted-foreground">Mark entries that bring balances in from before you started using Shusui (usually against Opening Balance Equity 3300).</span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Lines</CardTitle>
          <CardDescription>Tag receivable, payable and advance lines with a party so their statements stay right.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Account</th>
                <th className="w-32 px-2 py-2 text-right">Debit</th>
                <th className="w-32 px-2 py-2 text-right">Credit</th>
                <th className="w-64 px-2 py-2 text-left">Party (optional)</th>
                <th className="px-2 py-2 text-left">Line memo</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key} className="border-b align-top">
                  <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="min-w-64 px-2 py-1.5">
                    <Combobox options={accounts} value={l.accountId} onChange={(v) => update(l.key, { accountId: v })} placeholder="Choose account" searchPlaceholder="Code or name…" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      inputMode="decimal"
                      className="text-right tabular"
                      value={l.debit}
                      placeholder="0.00"
                      onChange={(e) => update(l.key, { debit: e.target.value, ...(Number(e.target.value) > 0 ? { credit: "" } : {}) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      inputMode="decimal"
                      className="text-right tabular"
                      value={l.credit}
                      placeholder="0.00"
                      onChange={(e) => update(l.key, { credit: e.target.value, ...(Number(e.target.value) > 0 ? { debit: "" } : {}) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1.5">
                      <Select value={l.partyType ?? "none"} onValueChange={(v) => update(l.key, { partyType: v === "none" ? null : (v as PartyType), partyId: null })}>
                        <SelectTrigger className="w-28 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No party</SelectItem>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="supplier">Supplier</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                      {l.partyType && (
                        <Combobox options={parties[l.partyType]} value={l.partyId} onChange={(v) => update(l.key, { partyId: v })} placeholder="Choose…" className={cn(!l.partyId && "border-destructive/60")} />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={l.memo} onChange={(e) => update(l.key, { memo: e.target.value })} placeholder="Optional" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground"
                      aria-label="Remove line"
                      disabled={lines.length <= 2}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={2} className="px-3 py-2.5">
                  <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
                    <Plus className="size-4" />
                    Add line
                  </Button>
                </td>
                <td className="px-4 py-2.5 text-right tabular">{formatMoney(totalDebit, { fixed: true })}</td>
                <td className="px-4 py-2.5 text-right tabular">{formatMoney(totalCredit, { fixed: true })}</td>
                <td colSpan={3} className="px-2 py-2.5">
                  {totalDebit === 0 && totalCredit === 0 ? (
                    <span className="text-sm font-normal text-muted-foreground">Enter the amounts</span>
                  ) : difference === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-success">
                      <CheckCircle2 className="size-4" /> Balanced
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-destructive">
                      <TriangleAlert className="size-4" /> Difference {formatMoney(Math.abs(difference), { fixed: true })} ({difference > 0 ? "more debit" : "more credit"})
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <p className="mr-auto text-xs text-muted-foreground">
          {missingAccount ? "Every line with an amount needs an account." : missingParty ? "Choose the party for tagged lines." : !memo.trim() ? "Add a memo describing the entry." : ""}
        </p>
        <Button variant="outline" asChild>
          <Link href="/accounting/journals">Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={!canSave}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Post journal
        </Button>
      </div>
    </div>
  );
}
