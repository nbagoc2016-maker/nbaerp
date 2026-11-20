"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { dayString, endOfMonth, parseDay, startOfMonth, today } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function periodPresets(fiscalStartMonth = 7) {
  const t = today();
  const d = parseDay(t);
  const lastMonthEnd = dayString(new Date(d.getFullYear(), d.getMonth(), 0));
  const fyStartYear = d.getMonth() + 1 >= fiscalStartMonth ? d.getFullYear() : d.getFullYear() - 1;
  const fyStart = dayString(new Date(fyStartYear, fiscalStartMonth - 1, 1));
  const fyEnd = dayString(new Date(fyStartYear + 1, fiscalStartMonth - 1, 0));
  const q = Math.floor(d.getMonth() / 3);
  return {
    today: { label: "Today", from: t, to: t },
    this_month: { label: "This month", from: startOfMonth(t), to: endOfMonth(t) },
    last_month: { label: "Last month", from: startOfMonth(lastMonthEnd), to: lastMonthEnd },
    this_quarter: {
      label: "This quarter",
      from: dayString(new Date(d.getFullYear(), q * 3, 1)),
      to: dayString(new Date(d.getFullYear(), q * 3 + 3, 0)),
    },
    this_year: { label: "This calendar year", from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` },
    fiscal_year: { label: "This fiscal year", from: fyStart, to: fyEnd },
  } as const;
}

/**
 * Date range control that lives in the URL (?from=YYYY-MM-DD&to=YYYY-MM-DD), so server pages
 * can read it from searchParams and links stay shareable.
 */
export function PeriodFilter({ from, to, fiscalStartMonth }: { from: string; to: string; fiscalStartMonth?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const presets = periodPresets(fiscalStartMonth);
  const current = Object.entries(presets).find(([, p]) => p.from === from && p.to === to)?.[0] ?? "custom";

  const apply = (nextFrom: string, nextTo: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("from", nextFrom);
    sp.set("to", nextTo);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarRange className="size-4 text-muted-foreground" />
      <Select
        value={current}
        onValueChange={(v) => {
          const p = presets[v as keyof typeof presets];
          if (p) apply(p.from, p.to);
        }}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(presets).map(([k, p]) => (
            <SelectItem key={k} value={k}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      <Input type="date" value={from} onChange={(e) => e.target.value && apply(e.target.value, to)} className="h-9 w-40" />
      <span className="text-muted-foreground">to</span>
      <Input type="date" value={to} onChange={(e) => e.target.value && apply(from, e.target.value)} className="h-9 w-40" />
    </div>
  );
}
