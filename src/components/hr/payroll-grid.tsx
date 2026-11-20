"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, Loader2, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import {
  deleteDraftRunAction,
  postPayrollRunAction,
  recalculateRunAction,
  savePayslipsAction,
} from "@/app/(app)/hr/payroll/actions";
import type { ComboOption } from "@/components/app/combobox";
import { ConfirmButton } from "@/components/app/confirm-button";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber, formatQty, monthLabel, round2 } from "@/lib/format";
import type { RunDetail } from "@/server/queries/hr";
import { EmployeeCell } from "./employee-avatar";
import { PaySalaryDialog } from "./pay-dialogs";

type Slip = RunDetail["slips"][number];
type Edit = { overtime: string; commission: string; bonus: string; otherDeduction: string };
const EDIT_COLS = ["overtime", "commission", "bonus", "otherDeduction"] as const;

const n = (v: string) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v || 0)) : 0);
const fromSlip = (s: Slip["slip"]): Edit => ({
  overtime: s.overtime ? String(s.overtime) : "",
  commission: s.commission ? String(s.commission) : "",
  bonus: s.bonus ? String(s.bonus) : "",
  otherDeduction: s.otherDeduction ? String(s.otherDeduction) : "",
});

/** Same maths as the server (payroll.ts): net never goes below zero; advance recovery shrinks first. */
function live(s: Slip["slip"], e: Edit) {
  const gross = round2(s.basic + s.allowances + n(e.overtime) + n(e.commission) + n(e.bonus) - s.absenceDeduction);
  const other = n(e.otherDeduction);
  let advance = s.advanceDeduction;
  let net = round2(gross - advance - other);
  if (net < 0) {
    advance = round2(Math.max(0, advance + net));
    net = round2(gross - advance - other);
  }
  return { gross, advance, other, net };
}

function CellInput({
  value,
  onChange,
  row,
  col,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  row: number;
  col: number;
  label: string;
}) {
  return (
    <input
      type="number"
      min={0}
      step="any"
      inputMode="decimal"
      value={value}
      placeholder="0"
      aria-label={label}
      data-cell={`${row}:${col}`}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        // Spreadsheet-style movement: Enter/↓ next row, ↑ previous row
        const dir = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const next = document.querySelector<HTMLInputElement>(`[data-cell="${row + (e.shiftKey && e.key === "Enter" ? -1 : dir)}:${col}"]`);
        next?.focus();
      }}
      className="tabular h-8 w-24 rounded-md border border-transparent bg-muted/40 px-2 text-right outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-input focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

export function PayrollGrid({ detail, accounts, canPay }: { detail: RunDetail; accounts: ComboOption[]; canPay: boolean }) {
  const { run: r, slips } = detail;
  const draft = r.status === "draft";
  const initial = useMemo(() => Object.fromEntries(slips.map((s) => [s.slip.id, fromSlip(s.slip)])) as Record<string, Edit>, [slips]);
  const [edits, setEdits] = useState(initial);
  // Only reset local edits when the server data really changed (not on every refresh)
  const sig = JSON.stringify(initial);
  const [loadedFor, setLoadedFor] = useState(sig);
  if (loadedFor !== sig) {
    setLoadedFor(sig);
    setEdits(initial);
  }
  const { run, pending } = useAction();

  const dirty = slips.filter((s) => EDIT_COLS.some((c) => n(edits[s.slip.id][c]) !== n(initial[s.slip.id][c])));
  const payload = (only: Slip[]) => ({
    runId: r.id,
    rows: only.map((s) => {
      const e = edits[s.slip.id];
      return { id: s.slip.id, overtime: n(e.overtime), commission: n(e.commission), bonus: n(e.bonus), otherDeduction: n(e.otherDeduction), notes: s.slip.notes };
    }),
  });

  const rows = slips.map((s) => ({ s, calc: draft ? live(s.slip, edits[s.slip.id]) : { gross: s.slip.gross, advance: s.slip.advanceDeduction, other: s.slip.otherDeduction, net: s.slip.net } }));
  const totals = rows.reduce(
    (t, { s, calc }) => ({
      fixed: t.fixed + s.slip.basic + s.slip.allowances,
      absence: t.absence + s.slip.absenceDeduction,
      overtime: t.overtime + (draft ? n(edits[s.slip.id].overtime) : s.slip.overtime),
      commission: t.commission + (draft ? n(edits[s.slip.id].commission) : s.slip.commission),
      bonus: t.bonus + (draft ? n(edits[s.slip.id].bonus) : s.slip.bonus),
      gross: t.gross + calc.gross,
      advance: t.advance + calc.advance,
      other: t.other + calc.other,
      net: t.net + calc.net,
      paid: t.paid + s.slip.paidAmount,
    }),
    { fixed: 0, absence: 0, overtime: 0, commission: 0, bonus: 0, gross: 0, advance: 0, other: 0, net: 0, paid: 0 }
  );

  const set = (id: string, col: keyof Edit, v: string) => setEdits((p) => ({ ...p, [id]: { ...p[id], [col]: v } }));
  const save = () => run(() => savePayslipsAction(payload(dirty)), { success: "Payroll changes saved" });
  const recalc = () =>
    run(async () => {
      if (dirty.length) {
        const res = await savePayslipsAction(payload(dirty));
        if (!res.ok) return res;
      }
      return recalculateRunAction({ id: r.id });
    }, { success: "Recalculated from current salaries, attendance and advances" });

  const th = "h-10 whitespace-nowrap px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  const td = "px-2 py-1.5 whitespace-nowrap";

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className={cn(th, "sticky left-0 z-10 bg-muted pl-3 text-left")}>Employee</th>
                <th className={cn(th, "text-right")} title="Paid days / working days">Days</th>
                <th className={cn(th, "text-right")}>Basic + allow.</th>
                <th className={cn(th, "text-right")}>Absence</th>
                <th className={cn(th, "text-right")}>Overtime</th>
                <th className={cn(th, "text-right")}>Commission</th>
                <th className={cn(th, "text-right")}>Bonus</th>
                <th className={cn(th, "border-l text-right")}>Gross</th>
                <th className={cn(th, "text-right")}>Advance</th>
                <th className={cn(th, "text-right")}>Other ded.</th>
                <th className={cn(th, "border-l text-right")}>Net pay</th>
                {!draft && <th className={cn(th, "text-right")}>Paid</th>}
                <th className={cn(th, "pr-3 text-right")} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, calc }, i) => {
                const e = edits[s.slip.id];
                const due = round2(s.slip.net - s.slip.paidAmount);
                const changed = dirty.some((d) => d.slip.id === s.slip.id);
                return (
                  <tr key={s.slip.id} className={cn("border-t", changed && "bg-primary/5")}>
                    <td className={cn(td, "sticky left-0 z-10 bg-card pl-3")}>
                      <EmployeeCell name={s.name} sub={[s.code, s.designation].filter(Boolean).join(" · ")} />
                    </td>
                    <td className={cn(td, "tabular text-right")}>
                      <span className="font-medium">{formatQty(s.slip.presentDays)}</span>
                      <span className="text-muted-foreground">/{formatQty(s.slip.workingDays)}</span>
                      {s.slip.absentDays > 0 && <span className="block text-xs text-destructive">{formatQty(s.slip.absentDays)} absent</span>}
                    </td>
                    <td className={cn(td, "tabular text-right")}>{formatNumber(s.slip.basic + s.slip.allowances)}</td>
                    <td className={cn(td, "tabular text-right", s.slip.absenceDeduction ? "text-destructive" : "text-muted-foreground")}>
                      {s.slip.absenceDeduction ? `−${formatNumber(s.slip.absenceDeduction)}` : "—"}
                    </td>
                    {(["overtime", "commission", "bonus"] as const).map((c, ci) => (
                      <td key={c} className={cn(td, "text-right")}>
                        {draft ? (
                          <CellInput value={e[c]} onChange={(v) => set(s.slip.id, c, v)} row={i} col={ci} label={`${c} for ${s.name}`} />
                        ) : (
                          <span className={cn("tabular", !s.slip[c] && "text-muted-foreground")}>{s.slip[c] ? formatNumber(s.slip[c]) : "—"}</span>
                        )}
                        {c === "overtime" && s.overtimeHours > 0 && <span className="block text-[11px] text-muted-foreground">{formatQty(s.overtimeHours)} hrs logged</span>}
                        {c === "commission" && s.commissionPct > 0 && <span className="block text-[11px] text-muted-foreground">{formatQty(s.commissionPct)}% rate</span>}
                      </td>
                    ))}
                    <td className={cn(td, "tabular border-l text-right font-medium")}>{formatNumber(calc.gross)}</td>
                    <td className={cn(td, "tabular text-right", calc.advance ? "text-warning-foreground dark:text-warning" : "text-muted-foreground")}>
                      {calc.advance ? `−${formatNumber(calc.advance)}` : "—"}
                    </td>
                    <td className={cn(td, "text-right")}>
                      {draft ? (
                        <CellInput value={e.otherDeduction} onChange={(v) => set(s.slip.id, "otherDeduction", v)} row={i} col={3} label={`Other deduction for ${s.name}`} />
                      ) : (
                        <span className={cn("tabular", !calc.other && "text-muted-foreground")}>{calc.other ? `−${formatNumber(calc.other)}` : "—"}</span>
                      )}
                    </td>
                    <td className={cn(td, "tabular border-l text-right text-base font-semibold")}>{formatNumber(calc.net)}</td>
                    {!draft && (
                      <td className={cn(td, "text-right")}>
                        <StatusBadge status={s.slip.status} />
                        {s.slip.status === "partial" && <span className="tabular block text-[11px] text-muted-foreground">{formatMoney(s.slip.paidAmount)} paid</span>}
                      </td>
                    )}
                    <td className={cn(td, "pr-3 text-right")}>
                      <div className="flex items-center justify-end gap-1">
                        {!draft && r.status === "posted" && canPay && due > 0 && <PaySalaryDialog payslipId={s.slip.id} employee={s.name} due={due} accounts={accounts} defaultDate={r.date} />}
                        <Button asChild size="icon-sm" variant="ghost" aria-label={`Payslip for ${s.name}`} title="Payslip">
                          <Link href={`/hr/payroll/payslips/${s.slip.id}`}>
                            <FileText />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 bg-muted/40 font-semibold">
              <tr>
                <td className={cn(td, "sticky left-0 z-10 bg-muted pl-3")}>
                  Total · {slips.length} employee{slips.length === 1 ? "" : "s"}
                </td>
                <td />
                <td className={cn(td, "tabular text-right")}>{formatNumber(totals.fixed)}</td>
                <td className={cn(td, "tabular text-right")}>{totals.absence ? `−${formatNumber(totals.absence)}` : "—"}</td>
                <td className={cn(td, "tabular text-right")}>{formatNumber(totals.overtime)}</td>
                <td className={cn(td, "tabular text-right")}>{formatNumber(totals.commission)}</td>
                <td className={cn(td, "tabular text-right")}>{formatNumber(totals.bonus)}</td>
                <td className={cn(td, "tabular border-l text-right")}>{formatNumber(totals.gross)}</td>
                <td className={cn(td, "tabular text-right")}>{totals.advance ? `−${formatNumber(totals.advance)}` : "—"}</td>
                <td className={cn(td, "tabular text-right")}>{totals.other ? `−${formatNumber(totals.other)}` : "—"}</td>
                <td className={cn(td, "tabular border-l text-right text-base")}>{formatMoney(totals.net)}</td>
                {!draft && <td className={cn(td, "tabular text-right")}>{formatMoney(totals.paid)}</td>}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {draft && (
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <span className="mr-auto text-sm text-muted-foreground">
            {dirty.length ? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"} · ` : ""}Net {formatMoney(totals.net)} for {monthLabel(r.period)}
          </span>
          <ConfirmButton
            variant="ghost"
            size="default"
            destructive
            title="Delete this draft payroll?"
            description="Payslips in this draft are removed. Nothing has been posted yet."
            confirmLabel="Delete draft"
            onConfirm={() => deleteDraftRunAction({ id: r.id })}
            success="Draft payroll deleted"
            redirectTo="/hr/payroll"
          >
            <Trash2 className="size-4" />
            Delete
          </ConfirmButton>
          <Button variant="outline" onClick={recalc} disabled={pending} title="Re-read salaries, attendance and advances; keeps amounts you typed">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Recalculate
          </Button>
          <Button variant="outline" onClick={save} disabled={pending || !dirty.length}>
            <Save className="size-4" />
            Save
          </Button>
          <ConfirmButton
            size="default"
            title={`Post payroll for ${monthLabel(r.period)}?`}
            description={
              <>
                Books {formatMoney(totals.gross)} salary expense, {formatMoney(totals.net)} payable to staff
                {totals.advance > 0 ? ` and recovers ${formatMoney(totals.advance)} of advances` : ""}. Attendance for the month is locked afterwards.
              </>
            }
            confirmLabel="Post payroll"
            onConfirm={() => postPayrollRunAction(payload(dirty))}
            success="Payroll posted"
          >
            <Send className="size-4" />
            Post payroll
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
