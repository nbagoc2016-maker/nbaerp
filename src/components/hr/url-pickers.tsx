"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, monthLabel, today } from "@/lib/format";
import { shiftPeriod } from "@/server/services/hr-dates";

function useSetParam(param: string, extra?: Record<string, string>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (value: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(param, value);
    for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };
}

/** Month picker that lives in the URL (?month=YYYY-MM by default). */
export function MonthPicker({ value, param = "month", max, extra }: { value: string; param?: string; max?: string; extra?: Record<string, string> }) {
  const set = useSetParam(param, extra);
  const next = shiftPeriod(value, 1);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-sm" onClick={() => set(shiftPeriod(value, -1))} aria-label="Previous month">
        <ChevronLeft />
      </Button>
      <Input
        type="month"
        value={value}
        max={max}
        onChange={(e) => e.target.value && set(e.target.value)}
        className="h-8 w-40"
        aria-label={monthLabel(value)}
      />
      <Button variant="outline" size="icon-sm" onClick={() => set(next)} disabled={!!max && next > max} aria-label="Next month">
        <ChevronRight />
      </Button>
    </div>
  );
}

/** Day picker in the URL (?date=YYYY-MM-DD) with previous/next day and a Today shortcut. */
export function DayPicker({ value, param = "date" }: { value: string; param?: string }) {
  const set = useSetParam(param);
  const t = today();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="outline" size="icon-sm" onClick={() => set(addDays(value, -1))} aria-label="Previous day">
        <ChevronLeft />
      </Button>
      <Input type="date" value={value} onChange={(e) => e.target.value && set(e.target.value)} className="h-8 w-40" />
      <Button variant="outline" size="icon-sm" onClick={() => set(addDays(value, 1))} aria-label="Next day">
        <ChevronRight />
      </Button>
      {value !== t && (
        <Button variant="ghost" size="sm" onClick={() => set(t)}>
          Today
        </Button>
      )}
    </div>
  );
}
