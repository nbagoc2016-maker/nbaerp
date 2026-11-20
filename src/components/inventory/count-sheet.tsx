"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCheck, Loader2, Printer, Save, Search, Send } from "lucide-react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatMoney, formatQty, round3 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { postCountAction, saveCountLinesAction } from "@/app/(app)/inventory/counts/actions";
import { FilterSwitch } from "./url-filters";
import { VoidDocButton } from "./doc-buttons";

export interface CountLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  barcode: string | null;
  unit: string;
  allowFraction: boolean;
  category: string | null;
  systemQty: number;
  countedQty: number | null;
  unitCost: number | null; // null without cost access
}

/** Counting sheet: enter counted quantities, see variances live, save progress, post. */
export function CountSheet({ countId, number, lines: initial, editable, canCost }: { countId: string; number: string; lines: CountLine[]; editable: boolean; canCost: boolean }) {
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((l) => [l.id, l.countedQty === null ? "" : String(l.countedQty)]))
  );
  const [q, setQ] = useState("");
  const [onlyVariances, setOnlyVariances] = useState(false);
  const [onlyUncounted, setOnlyUncounted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { run, pending } = useAction();

  const valueOf = (id: string) => (counted[id] === "" || counted[id] === undefined ? null : Number(counted[id]));
  const stats = (() => {
    let done = 0;
    let variances = 0;
    let gain = 0;
    let loss = 0;
    for (const l of initial) {
      const c = valueOf(l.id);
      if (c === null || Number.isNaN(c)) continue;
      done++;
      const diff = round3(c - l.systemQty);
      if (diff !== 0) {
        variances++;
        const v = diff * (l.unitCost ?? 0);
        if (v > 0) gain += v;
        else loss -= v;
      }
    }
    return { done, variances, gain, loss };
  })();

  const shown = initial.filter((l) => {
    const c = valueOf(l.id);
    if (onlyUncounted && c !== null) return false;
    if (onlyVariances && (c === null || round3(c - l.systemQty) === 0)) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return l.name.toLowerCase().includes(s) || l.sku.toLowerCase().includes(s) || (l.barcode ?? "").toLowerCase() === s || (l.category ?? "").toLowerCase().includes(s);
  });

  const payload = () => ({
    id: countId,
    lines: initial.map((l) => {
      const c = valueOf(l.id);
      return { lineId: l.id, countedQty: c === null || Number.isNaN(c) ? null : c };
    }),
  });
  const pct = initial.length ? Math.round((stats.done / initial.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card className="py-4">
        <CardContent className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium tabular">
                {stats.done} / {initial.length} ({pct}%)
              </span>
            </div>
            <Progress value={pct} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Variances</p>
            <p className="text-xl font-semibold tabular">{stats.variances}</p>
          </div>
          {canCost && (
            <>
              <div>
                <p className="text-sm text-muted-foreground">Surplus value</p>
                <p className="text-xl font-semibold tabular text-success">{formatMoney(stats.gain)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Shortage value</p>
                <p className="text-xl font-semibold tabular text-destructive">-{formatMoney(stats.loss)}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, or scan a barcode…" className="h-9 pl-8" />
        </div>
        <FilterSwitch id="only-var" checked={onlyVariances} onChange={setOnlyVariances} label="Only variances" />
        {editable && <FilterSwitch id="only-unc" checked={onlyUncounted} onChange={setOnlyUncounted} label="Only uncounted" />}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/inventory/counts/${countId}/print`} target="_blank">
              <Printer className="size-4" />
              Count sheet
            </Link>
          </Button>
          {editable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCounted((c) => {
                  const next = { ...c };
                  for (const l of initial) if (next[l.id] === "" || next[l.id] === undefined) next[l.id] = String(l.systemQty);
                  return next;
                });
                setDirty(true);
              }}
              title="Fill every uncounted line with its system quantity"
            >
              <CheckCheck className="size-4" />
              Rest match system
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="w-28 px-3 py-2 text-right">System</th>
                <th className="w-36 px-3 py-2 text-right">Counted</th>
                <th className="w-28 px-3 py-2 text-right">Variance</th>
                {canCost && <th className="w-32 px-3 py-2 text-right">Value</th>}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={canCost ? 6 : 5} className="h-24 text-center text-muted-foreground">
                    No matching lines.
                  </td>
                </tr>
              )}
              {shown.map((l) => {
                const c = valueOf(l.id);
                const diff = c === null || Number.isNaN(c) ? null : round3(c - l.systemQty);
                return (
                  <tr key={l.id} className={cn("border-t", diff !== null && diff !== 0 && "bg-warning/5")}>
                    <td className="px-3 py-2">
                      <span className="font-medium">{l.name}</span>
                      <span className="block text-xs text-muted-foreground">{l.sku}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular">
                      {formatQty(l.systemQty)} <span className="text-xs text-muted-foreground">{l.unit}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      {editable ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={l.allowFraction ? 0.001 : 1}
                          value={counted[l.id] ?? ""}
                          onChange={(e) => {
                            setCounted((cur) => ({ ...cur, [l.id]: e.target.value }));
                            setDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            // Enter jumps to the next counted box, like a spreadsheet
                            const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-count]"));
                            const i = inputs.indexOf(e.currentTarget);
                            inputs[i + 1]?.focus();
                            inputs[i + 1]?.select();
                          }}
                          data-count
                          className="h-8 text-right tabular"
                          aria-label={`Counted quantity for ${l.name}`}
                        />
                      ) : (
                        <span className="block text-right tabular">{c === null ? <span className="text-muted-foreground">Not counted</span> : formatQty(c)}</span>
                      )}
                    </td>
                    <td className={cn("px-3 py-2 text-right font-medium tabular", diff !== null && diff > 0 && "text-success", diff !== null && diff < 0 && "text-destructive")}>
                      {diff === null ? <span className="text-muted-foreground">—</span> : diff === 0 ? <span className="text-muted-foreground">0</span> : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}
                    </td>
                    {canCost && (
                      <td className={cn("px-3 py-2 text-right tabular", diff && diff > 0 && "text-success", diff && diff < 0 && "text-destructive")}>
                        {diff ? formatMoney(diff * (l.unitCost ?? 0)) : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editable && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          {dirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>}
          <VoidDocButton kind="count" id={countId} number={number} posted={false} />
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => saveCountLinesAction(payload()), { success: "Progress saved", onSuccess: () => setDirty(false) })}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save progress
          </Button>
          <ConfirmButton
            size="default"
            title={`Post count ${number}?`}
            description={
              <>
                {stats.variances} item(s) differ from the system and will be adjusted
                {canCost ? ` (surplus ${formatMoney(stats.gain)}, shortage ${formatMoney(stats.loss)})` : ""}. {initial.length - stats.done} uncounted item(s) are left unchanged.
              </>
            }
            confirmLabel="Post count"
            success="Count posted"
            disabled={stats.done === 0}
            onConfirm={() => postCountAction(payload())}
          >
            <Send className="size-4" />
            Post count
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
