import { cn } from "@/lib/utils";
import { parseDay } from "@/lib/format";
import { monthDays, isSunday } from "@/server/services/hr-dates";
import type { AttendanceStatus } from "@/server/services/hr-schemas";
import { ATTENDANCE_META, STATUS_ORDER } from "./attendance-style";

/** One month as a strip of day tiles coloured by attendance; Sundays are marked off. */
export function AttendanceStrip({ period, marks }: { period: string; marks: Record<string, string> }) {
  const days = monthDays(period);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-[repeat(16,minmax(0,1fr))] lg:grid-cols-[repeat(31,minmax(0,1fr))]">
        {days.map((d) => {
          const st = marks[d] as AttendanceStatus | undefined;
          const meta = st ? ATTENDANCE_META[st] : null;
          const sunday = isSunday(d);
          return (
            <div
              key={d}
              title={`${parseDay(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}: ${meta?.label ?? (sunday ? "Sunday" : "Not marked")}`}
              className={cn(
                "flex aspect-square min-w-0 flex-col items-center justify-center rounded-md border text-[10px] leading-tight",
                meta ? cn(meta.cell, "border-transparent") : sunday ? "border-dashed bg-muted/40 text-muted-foreground" : "text-muted-foreground"
              )}
            >
              <span className="tabular font-semibold">{Number(d.slice(8))}</span>
              <span className="font-medium">{meta?.short ?? (sunday ? "Sun" : "")}</span>
            </div>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[9px] font-semibold", ATTENDANCE_META[s].cell)}>{ATTENDANCE_META[s].short}</span>
          {ATTENDANCE_META[s].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-4 rounded border border-dashed bg-muted/40" />
        Sunday (weekly off)
      </span>
    </div>
  );
}
