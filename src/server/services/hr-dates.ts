// Calendar helpers for HR (shared by server and client; no server-only imports).
import { addDays, dayString, endOfMonth, parseDay } from "@/lib/format";

export const isSunday = (day: string) => parseDay(day).getDay() === 0;

/** Every YYYY-MM-DD from `from` to `to` inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Days in the range that are working days (Sundays off). */
export const workingDaysBetween = (from: string, to: string) => daysBetween(from, to).filter((d) => !isSunday(d));

export const periodStart = (period: string) => `${period}-01`;
export const periodEnd = (period: string) => endOfMonth(`${period}-01`);

/** All days of a YYYY-MM month. */
export const monthDays = (period: string) => daysBetween(periodStart(period), periodEnd(period));

export function shiftPeriod(period: string, months: number): string {
  const d = parseDay(`${period}-01`);
  d.setMonth(d.getMonth() + months);
  return dayString(d).slice(0, 7);
}
