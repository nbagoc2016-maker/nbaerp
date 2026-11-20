import { endOfMonth, startOfMonth } from "./format";

/** Read ?from&to (YYYY-MM-DD) from page searchParams, defaulting to this month. */
export function readPeriod(sp: { from?: string; to?: string }, fallback?: { from: string; to: string }) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  return {
    from: sp.from && re.test(sp.from) ? sp.from : (fallback?.from ?? startOfMonth()),
    to: sp.to && re.test(sp.to) ? sp.to : (fallback?.to ?? endOfMonth()),
  };
}
