"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (key: string, value: string | null, mode: "push" | "replace" = "push") => {
    const sp = new URLSearchParams(params.toString());
    if (value && value !== "all") sp.set(key, value);
    else sp.delete(key);
    const url = `${pathname}${sp.size ? `?${sp.toString()}` : ""}`;
    if (mode === "replace") router.replace(url, { scroll: false });
    else router.push(url);
  };
}

/** A select whose value lives in the URL (?key=value), for list filters. */
export function UrlSelect({
  param,
  value,
  options,
  placeholder,
  className = "h-9 w-40",
}: {
  param: string;
  value?: string;
  options: { value: string; label: string }[];
  placeholder: string;
  className?: string;
}) {
  const setParam = useSetParam();
  return (
    <Select value={value || "all"} onValueChange={(v) => setParam(param, v)}>
      <SelectTrigger className={className} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Tabs that remember the active tab in ?tab= so filters and refreshes keep it. */
export function UrlTabs({
  value,
  tabs,
  children,
}: {
  value: string;
  tabs: { value: string; label: React.ReactNode }[];
  children: React.ReactNode;
}) {
  const setParam = useSetParam();
  return (
    <Tabs value={value} onValueChange={(v) => setParam("tab", v === tabs[0]?.value ? null : v, "replace")} className="gap-4">
      <div className="no-print overflow-x-auto">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="px-3">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
