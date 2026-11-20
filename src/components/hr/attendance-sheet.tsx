"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCheck, Loader2, Lock, RotateCcw, Save, Search, UserPlus } from "lucide-react";
import { saveAttendanceAction } from "@/app/(app)/hr/attendance/actions";
import { EmptyState } from "@/components/app/empty-state";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { SheetRow } from "@/server/queries/hr";
import type { AttendanceStatus } from "@/server/services/hr-schemas";
import { ATTENDANCE_META, STATUS_ORDER } from "./attendance-style";
import { EmployeeCell } from "./employee-avatar";

type Mark = { status: AttendanceStatus | null; checkIn: string; checkOut: string; overtimeHours: string; notes: string };

const toMark = (r: SheetRow): Mark => ({
  status: r.status,
  checkIn: r.checkIn ?? "",
  checkOut: r.checkOut ?? "",
  overtimeHours: r.overtimeHours ? String(r.overtimeHours) : "",
  notes: r.notes ?? "",
});
const same = (a: Mark, b: Mark) =>
  a.status === b.status && a.checkIn === b.checkIn && a.checkOut === b.checkOut && Number(a.overtimeHours || 0) === Number(b.overtimeHours || 0) && a.notes === b.notes;

/**
 * Daily attendance sheet: one row per employee with one-click status buttons, times, overtime
 * and a note. Everything is saved in one action (upsert per employee + date).
 */
export function AttendanceSheet({
  date,
  rows,
  locked,
  canEdit,
  isSunday,
  canManage,
}: {
  date: string;
  rows: SheetRow[];
  locked: boolean;
  canEdit: boolean;
  isSunday: boolean;
  canManage: boolean;
}) {
  const initial = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, toMark(r)])) as Record<string, Mark>, [rows]);
  const [marks, setMarks] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [q, setQ] = useState("");
  const { run, pending } = useAction();
  const readOnly = locked || !canEdit;

  // A different date (or fresh server data) resets the sheet
  // Only reset local edits when the server data really changed (not on every refresh)
  const sig = JSON.stringify(initial);
  const [loadedFor, setLoadedFor] = useState(sig);
  if (loadedFor !== sig) {
    setLoadedFor(sig);
    setMarks(initial);
    setBaseline(initial);
  }

  const changed = rows.filter((r) => !same(marks[r.id], baseline[r.id]));
  const counts = useMemo(() => {
    const c: Record<string, number> = { unmarked: 0 };
    for (const r of rows) {
      const s = marks[r.id]?.status;
      c[s ?? "unmarked"] = (c[s ?? "unmarked"] ?? 0) + 1;
    }
    return c;
  }, [rows, marks]);

  const visible = q.trim()
    ? rows.filter((r) => `${r.name} ${r.code} ${r.designation ?? ""} ${r.department ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : rows;

  const update = (id: string, patch: Partial<Mark>) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }));
  const setStatus = (id: string, s: AttendanceStatus) => update(id, { status: marks[id].status === s ? null : s });
  const markAll = (s: AttendanceStatus) =>
    setMarks((m) => {
      const next = { ...m };
      // Keep approved leave and holidays already marked
      for (const r of rows) if (next[r.id].status !== "leave" && next[r.id].status !== "holiday") next[r.id] = { ...next[r.id], status: s };
      return next;
    });

  const save = () =>
    run(
      () =>
        saveAttendanceAction({
          date,
          rows: changed.map((r) => {
            const m = marks[r.id];
            return { employeeId: r.id, status: m.status, checkIn: m.checkIn, checkOut: m.checkOut, overtimeHours: m.overtimeHours || 0, notes: m.notes };
          }),
        }),
      {
        success: (d) => `Attendance saved for ${formatDate(date)} (${d.saved + d.cleared} employee${d.saved + d.cleared === 1 ? "" : "s"})`,
        onSuccess: () => setBaseline(marks),
      }
    );

  if (!rows.length) {
    return (
      <EmptyState
        title="No employees to mark"
        description="Attendance lists everyone employed on this date. Add employees first."
        action={
          canManage ? (
            <Button asChild size="sm">
              <Link href="/hr/employees/new">
                <UserPlus className="size-4" />
                Add employee
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {locked && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <Lock className="size-4 shrink-0" />
          Payroll for this month is posted, so attendance is locked. Void the payroll run to make changes.
        </div>
      )}
      {isSunday && !locked && (
        <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This is a Sunday (weekly off). Payroll ignores Sundays, so you only need to mark people who worked overtime.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find employee…" className="h-9 pl-8" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
            <span key={s} className={cn("rounded-full px-2 py-0.5 font-medium", ATTENDANCE_META[s].cell)}>
              {ATTENDANCE_META[s].label} {counts[s]}
            </span>
          ))}
          {counts.unmarked > 0 && <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">Not marked {counts.unmarked}</span>}
        </div>
        {!readOnly && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => markAll(isSunday ? "holiday" : "present")}>
              <CheckCheck className="size-4" />
              {isSunday ? "Mark all holiday" : "Mark all present"}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="h-10 px-3">Employee</th>
                <th className="h-10 px-3">Status</th>
                <th className="h-10 px-2">In</th>
                <th className="h-10 px-2">Out</th>
                <th className="h-10 px-2 text-right">OT hrs</th>
                <th className="h-10 px-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const m = marks[r.id];
                const dirty = !same(m, baseline[r.id]);
                return (
                  <tr key={r.id} className={cn("border-t align-middle", dirty && "bg-primary/5")}>
                    <td className="px-3 py-2">
                      <EmployeeCell name={r.name} sub={[r.code, r.designation].filter(Boolean).join(" · ")} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Status for ${r.name}`}>
                        {STATUS_ORDER.map((s) => (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={m.status === s}
                            data-on={m.status === s}
                            disabled={readOnly}
                            onClick={() => setStatus(r.id, s)}
                            title={ATTENDANCE_META[s].label}
                            className={cn(
                              "h-7 rounded-md border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-60",
                              ATTENDANCE_META[s].button
                            )}
                          >
                            {ATTENDANCE_META[s].label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="time"
                        value={m.checkIn}
                        onChange={(e) => update(r.id, { checkIn: e.target.value })}
                        disabled={readOnly || !m.status || m.status === "absent" || m.status === "leave"}
                        className="h-8 w-[6.5rem]"
                        aria-label={`Check-in for ${r.name}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="time"
                        value={m.checkOut}
                        onChange={(e) => update(r.id, { checkOut: e.target.value })}
                        disabled={readOnly || !m.status || m.status === "absent" || m.status === "leave"}
                        className="h-8 w-[6.5rem]"
                        aria-label={`Check-out for ${r.name}`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        step="0.5"
                        inputMode="decimal"
                        value={m.overtimeHours}
                        onChange={(e) => update(r.id, { overtimeHours: e.target.value })}
                        disabled={readOnly}
                        className="tabular ml-auto h-8 w-16 text-right"
                        aria-label={`Overtime hours for ${r.name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={m.notes}
                        onChange={(e) => update(r.id, { notes: e.target.value })}
                        disabled={readOnly}
                        placeholder="—"
                        className="h-8 min-w-36"
                        aria-label={`Note for ${r.name}`}
                      />
                    </td>
                  </tr>
                );
              })}
              {!visible.length && (
                <tr>
                  <td colSpan={6} className="h-20 text-center text-muted-foreground">
                    No employee matches “{q}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
          <span className="mr-auto text-sm text-muted-foreground">
            {changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "All changes saved"}
          </span>
          <Button variant="outline" onClick={() => setMarks(baseline)} disabled={!changed.length || pending}>
            <RotateCcw className="size-4" />
            Undo
          </Button>
          <Button onClick={save} disabled={!changed.length || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save attendance
          </Button>
        </div>
      )}
    </div>
  );
}
