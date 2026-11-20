import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Accounting format: fixed decimals, negatives in brackets. Used in statements and CSV exports. */
export function fmtAmount(value: number | null | undefined, opts: { symbol?: boolean } = {}) {
  const n = Number(value ?? 0);
  const body = formatMoney(Math.abs(n), { fixed: true, symbol: opts.symbol === false ? "" : undefined }).trim();
  return n < 0 ? `(${body})` : body;
}

/** Plain number for CSV cells (no symbol, no grouping) so spreadsheets can sum it. */
export const csvAmount = (value: number | null | undefined) => (Math.round(Number(value ?? 0) * 100) / 100).toFixed(2);

/** Statement amount: tabular, fixed decimals, negatives in brackets and red. */
export function Amount({
  value,
  className,
  muteZero,
  dash,
}: {
  value: number | null | undefined;
  className?: string;
  /** Show zero as a muted dash */
  muteZero?: boolean;
  /** Render a dash (empty column) regardless of value */
  dash?: boolean;
}) {
  const n = Number(value ?? 0);
  if (dash || (muteZero && Math.abs(n) < 0.005)) return <span className={cn("tabular text-muted-foreground", className)}>—</span>;
  return <span className={cn("tabular whitespace-nowrap", n < 0 && "text-destructive", className)}>{fmtAmount(n)}</span>;
}
