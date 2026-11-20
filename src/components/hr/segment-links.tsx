import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven segmented control (filters and views that server pages read from searchParams). */
export function SegmentLinks({ items, className }: { items: { label: React.ReactNode; href: string; active: boolean; count?: number }[]; className?: string }) {
  return (
    <div className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-[3px] text-sm", className)}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          scroll={false}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-foreground/60 transition-colors hover:text-foreground",
            i.active && "bg-background text-foreground shadow-sm dark:bg-input/30"
          )}
        >
          {i.label}
          {i.count !== undefined && <span className="tabular rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}
