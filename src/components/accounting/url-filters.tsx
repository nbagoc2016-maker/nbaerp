"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function useSetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (changes: Record<string, string | null | undefined>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
}

export { useSetParams };

/** A select whose value lives in the URL (?param=value). "all" clears the param. */
export function UrlSelect({
  param,
  value,
  options,
  allLabel = "All",
  className,
  label,
}: {
  param: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
  label?: string;
}) {
  const set = useSetParams();
  return (
    <Select value={value || "all"} onValueChange={(v) => set({ [param]: v === "all" ? null : v })}>
      <SelectTrigger className={cn("h-9 w-44", className)} aria-label={label ?? param}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Single "as of" date kept in the URL (?asOf=YYYY-MM-DD). */
export function AsOfFilter({ value, param = "asOf", label = "As of" }: { value: string; param?: string; label?: string }) {
  const set = useSetParams();
  return (
    <div className="flex items-center gap-2">
      <CalendarDays className="size-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <Input type="date" value={value} onChange={(e) => e.target.value && set({ [param]: e.target.value })} className="h-9 w-40" />
    </div>
  );
}
