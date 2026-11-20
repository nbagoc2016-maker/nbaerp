// Attendance status presentation shared by the daily sheet, month grid and employee strip.
import type { AttendanceStatus } from "@/server/services/hr-schemas";

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; short: string; cell: string; button: string }> = {
  present: { label: "Present", short: "P", cell: "bg-success/15 text-success", button: "data-[on=true]:bg-success data-[on=true]:text-success-foreground data-[on=true]:border-success" },
  late: {
    label: "Late",
    short: "L",
    cell: "bg-warning/25 text-warning-foreground dark:text-warning",
    button: "data-[on=true]:bg-warning data-[on=true]:text-warning-foreground data-[on=true]:border-warning",
  },
  half_day: {
    label: "Half day",
    short: "½",
    cell: "bg-warning/12 text-warning-foreground dark:text-warning",
    button: "data-[on=true]:bg-warning/60 data-[on=true]:text-warning-foreground data-[on=true]:border-warning",
  },
  absent: { label: "Absent", short: "A", cell: "bg-destructive/15 text-destructive", button: "data-[on=true]:bg-destructive data-[on=true]:text-primary-foreground dark:data-[on=true]:text-foreground data-[on=true]:border-destructive" },
  leave: { label: "Leave", short: "LV", cell: "bg-info/15 text-info", button: "data-[on=true]:bg-info data-[on=true]:text-info-foreground data-[on=true]:border-info" },
  holiday: { label: "Holiday", short: "H", cell: "bg-muted text-muted-foreground", button: "data-[on=true]:bg-foreground/70 data-[on=true]:text-background data-[on=true]:border-foreground/70" },
};

export const STATUS_ORDER: AttendanceStatus[] = ["present", "absent", "late", "half_day", "leave", "holiday"];

/** Totals for a set of statuses (present counts late and half days as attended). */
export function attendanceTotals(statuses: (string | undefined | null)[]) {
  const t = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0, holiday: 0 };
  for (const s of statuses) if (s && s in t) t[s as keyof typeof t]++;
  return t;
}
