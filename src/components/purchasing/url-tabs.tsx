"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Tabs whose selection lives in ?tab=, so server-rendered tab content survives filters and reloads. */
export function UrlTabs({
  value,
  tabs,
  children,
}: {
  value: string;
  tabs: { value: string; label: React.ReactNode }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        const sp = new URLSearchParams(params.toString());
        sp.set("tab", v);
        router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
      }}
      className="gap-4"
    >
      <div className="no-print overflow-x-auto">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
