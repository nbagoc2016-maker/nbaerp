import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";
import { parseDay, today } from "@/lib/format";
import { isSunday, monthDays } from "@/server/services/hr-dates";
import type { AttendanceStatus } from "@/server/services/hr-schemas";
import { ATTENDANCE_META, attendanceTotals } from "./attendance-style";
import { Legend } from "./attendance-strip";

/** Employees × days for a month, coloured by status, with per-employee totals. Sundays shaded. */
export function AttendanceMonthGrid({
  period,
  staff,
  marks,
}: {
  period: string;
  staff: { id: string; code: string; name: string; department: string | null }[];
  marks: Record<string, Record<string, string>>;
}) {
  const days = monthDays(period);
  const t = today();
  if (!staff.length) return <EmptyState title="No employees in this month" description="The grid lists everyone employed during the month." />;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-44 border-b bg-muted px-3 py-2 text-left font-semibold uppercase tracking-wide">Employee</th>
                {days.map((d) => (
                  <th key={d} className={cn("min-w-7 border-b px-0 py-1 text-center font-medium", isSunday(d) && "bg-muted", d === t && "text-primary")}>
                    <Link href={`/hr/attendance?date=${d}`} className="block hover:text-foreground" title="Open daily sheet">
                      <span className="block text-[10px] uppercase">{parseDay(d).toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
                      <span className="tabular block font-semibold">{Number(d.slice(8))}</span>
                    </Link>
                  </th>
                ))}
                <th className="border-b border-l px-2 py-2 text-right font-semibold" title="Present, late and half days">Present</th>
                <th className="border-b px-2 py-2 text-right font-semibold">Absent</th>
                <th className="border-b px-2 py-2 text-right font-semibold">Late</th>
                <th className="border-b px-2 py-2 text-right font-semibold">Leave</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((e) => {
                const row = marks[e.id] ?? {};
                const tot = attendanceTotals(Object.values(row));
                return (
                  <tr key={e.id} className="group">
                    <td className="sticky left-0 z-10 border-b bg-card px-3 py-1.5 group-hover:bg-muted">
                      <Link href={`/hr/employees/${e.id}?tab=attendance&month=${period}`} className="block truncate font-medium hover:underline">
                        {e.name}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">{e.code}</span>
                    </td>
                    {days.map((d) => {
                      const st = row[d] as AttendanceStatus | undefined;
                      const meta = st ? ATTENDANCE_META[st] : null;
                      return (
                        <td key={d} className={cn("border-b p-0.5 text-center", isSunday(d) && !meta && "bg-muted/60")}>
                          <span
                            title={meta ? `${d}: ${meta.label}` : undefined}
                            className={cn("flex h-7 items-center justify-center rounded text-[10px] font-semibold", meta?.cell)}
                          >
                            {meta?.short ?? ""}
                          </span>
                        </td>
                      );
                    })}
                    <td className="tabular border-b border-l px-2 text-right font-semibold text-success">{tot.present + tot.late + tot.half_day}</td>
                    <td className={cn("tabular border-b px-2 text-right", tot.absent ? "font-semibold text-destructive" : "text-muted-foreground")}>{tot.absent}</td>
                    <td className={cn("tabular border-b px-2 text-right", tot.late ? "font-semibold" : "text-muted-foreground")}>{tot.late}</td>
                    <td className={cn("tabular border-b px-2 text-right", tot.leave ? "font-semibold text-info" : "text-muted-foreground")}>{tot.leave}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Legend />
    </div>
  );
}
