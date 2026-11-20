"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Combobox, type ComboOption } from "@/components/app/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const ALL = "__all__";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (name: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(name, value);
    else sp.delete(name);
    const q = sp.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  };
}

/** A select whose value lives in the URL (?name=value), for server-filtered pages. */
export function UrlSelect({
  name,
  value,
  options,
  allLabel,
  className,
}: {
  name: string;
  value: string | null | undefined;
  options: { value: string; label: string }[];
  allLabel: string;
  className?: string;
}) {
  const setParam = useSetParam();
  return (
    <Select value={value || ALL} onValueChange={(v) => setParam(name, v === ALL ? null : v)}>
      <SelectTrigger className={cn("h-9 w-44", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UrlCombobox({
  name,
  value,
  options,
  placeholder,
  className,
}: {
  name: string;
  value: string | null | undefined;
  options: ComboOption[];
  placeholder: string;
  className?: string;
}) {
  const setParam = useSetParam();
  return (
    <div className={cn("w-64", className)}>
      <Combobox options={options} value={value ?? null} onChange={(v) => setParam(name, v)} placeholder={placeholder} allowClear className="h-9" />
    </div>
  );
}

export function UrlSwitch({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  const setParam = useSetParam();
  const id = `sw-${name}`;
  return (
    <label htmlFor={id} className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
      <Switch id={id} checked={checked} onCheckedChange={(c) => setParam(name, c ? "1" : null)} />
      {label}
    </label>
  );
}

/** Plain local-state helpers for client-side filtering (no URL). */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
  className?: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger className={cn("h-9 w-40", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterSwitch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label htmlFor={id} className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
