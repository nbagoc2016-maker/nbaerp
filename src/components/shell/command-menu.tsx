"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { NAV } from "@/config/nav";
import { QUICK_CREATE } from "@/config/quick-create";
import { hasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

/** Ctrl/⌘ + K: jump to any screen or start a new document. */
export function CommandMenu({ permissions }: { permissions: string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const allowed = <T extends { permission?: Parameters<typeof hasPermission>[1] }>(items: T[]) =>
    items.filter((i) => !i.permission || hasPermission(permissions, i.permission));

  return (
    <>
      <Button
        variant="outline"
        aria-label="Search"
        className="h-9 w-9 justify-center gap-2 bg-muted/40 px-0 text-muted-foreground shadow-none sm:w-64 sm:justify-start sm:px-3"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="hidden flex-1 text-left text-sm sm:inline">Search or jump to…</span>
        <kbd className="pointer-events-none hidden rounded border bg-background px-1.5 font-mono text-[10px] sm:inline-block">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Shusui" description="Jump to a screen or create a document">
        <CommandInput placeholder="Type a screen or action…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Create">
            {allowed(QUICK_CREATE).map((q) => (
              <CommandItem key={q.href} value={`new ${q.title}`} onSelect={() => go(q.href)}>
                <q.icon />
                New {q.title}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          {NAV.map((group) => {
            const items = allowed(group.items);
            if (!items.length) return null;
            return (
              <CommandGroup key={group.title} heading={group.title}>
                {items.map((item) => (
                  <CommandItem key={item.href} value={`${item.title} ${group.title} ${item.keywords ?? ""}`} onSelect={() => go(item.href)}>
                    <item.icon />
                    {item.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
