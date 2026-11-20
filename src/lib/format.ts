// Shared by server and client. Keep free of server-only imports.

export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TZ ?? "Asia/Karachi";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

const moneyFormatter = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const moneyFixed = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFormatter = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 3 });

/** Rs 12,500 (or Rs 12,500.50). Pass fixed for statements where decimals must line up. */
export function formatMoney(value: number | null | undefined, opts: { symbol?: string; fixed?: boolean } = {}) {
  const n = Number(value ?? 0);
  const symbol = opts.symbol ?? "Rs";
  const abs = Math.abs(n);
  // Whole amounts print without decimals ("Rs 1,500"); anything with paisa always shows two
  // digits ("Rs 61.60", never "Rs 61.6")
  const hasPaisa = Math.round(abs * 100) % 100 !== 0;
  const body = (opts.fixed || hasPaisa ? moneyFixed : moneyFormatter).format(abs);
  return `${n < 0 ? "-" : ""}${symbol} ${body}`;
}

export const formatNumber = (value: number | null | undefined) => moneyFormatter.format(Number(value ?? 0));
export const formatQty = (value: number | null | undefined) => qtyFormatter.format(Number(value ?? 0));

/** Today's calendar date (YYYY-MM-DD) in the business time zone. */
export function today(): string {
  return toDay(new Date());
}

export function toDay(date: Date): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(date);
}

/** Parse YYYY-MM-DD as a local calendar date (never UTC, which shifts the day). */
export function parseDay(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(value: string, days: number): string {
  const d = parseDay(value);
  d.setDate(d.getDate() + days);
  return dayString(d);
}

export function dayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDate(value: string | Date | null | undefined, style: "short" | "long" = "short"): string {
  if (!value) return "";
  const d = typeof value === "string" ? (value.length === 10 ? parseDay(value) : new Date(value)) : value;
  return d.toLocaleDateString("en-GB", style === "long" ? { day: "numeric", month: "long", year: "numeric" } : { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
}

export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function startOfMonth(value = today()): string {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value = today()): string {
  const d = parseDay(startOfMonth(value));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return dayString(d);
}
