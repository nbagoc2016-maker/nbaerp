"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (name: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(name, value);
    else sp.delete(name);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
}

const ALL = "__all";

/** Select bound to a URL search param (warehouse, account…). Empty means "all". */
export function ParamSelect({
  name,
  value,
  options,
  allLabel,
  className = "h-9 w-48",
}: {
  name: string;
  value: string | null | undefined;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  const setParam = useSetParam();
  return (
    <Select value={value || ALL} onValueChange={(v) => setParam(name, v === ALL ? null : v)}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Segmented control bound to a URL search param (e.g. group=day|month). */
export function ParamToggle({ name, value, options }: { name: string; value: string; options: { value: string; label: string }[] }) {
  const setParam = useSetParam();
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && setParam(name, v)}>
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className="h-9 px-3">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
