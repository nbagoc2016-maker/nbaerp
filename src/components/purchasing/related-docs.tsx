import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/app/money";
import { StatusBadge } from "@/components/app/status-badge";

export interface RelatedDoc {
  href: string;
  number: string;
  date?: string | null;
  status?: string | null;
  amount?: number | null;
}

/** Side card listing linked documents (PO -> GRN -> Bill -> Payment) on a detail page. */
export function RelatedDocs({
  groups,
  className,
}: {
  groups: { label: string; docs: RelatedDoc[]; empty?: string; action?: React.ReactNode }[];
  className?: string;
}) {
  return (
    <Card className={cn("no-print gap-0 py-0", className)}>
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-sm">Related documents</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {groups.map((g) => (
          <div key={g.label} className="space-y-2 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
              {g.action}
            </div>
            {g.docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{g.empty ?? "None yet"}</p>
            ) : (
              <ul className="space-y-1.5">
                {g.docs.map((d) => (
                  <li key={d.href}>
                    <Link href={d.href} className="group flex items-center justify-between gap-2 rounded-md text-sm hover:text-primary">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-medium">{d.number}</span>
                        {d.date && <span className="truncate text-xs text-muted-foreground">{formatDate(d.date)}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        {d.amount != null && <Money value={d.amount} className="text-xs" />}
                        {d.status && <StatusBadge status={d.status} />}
                        <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Small label/value list for the side summary card. */
export function SummaryList({ items }: { items: { label: string; value: React.ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="space-y-2 text-sm">
      {items.map((i) => (
        <div key={i.label} className={cn("flex items-center justify-between gap-3", i.strong && "border-t pt-2 font-semibold")}>
          <dt className={cn(!i.strong && "text-muted-foreground")}>{i.label}</dt>
          <dd className="text-right tabular">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Document flow strip: PO -> Goods receipt -> Bill -> Payment, highlighting the current step. */
export function DocFlow({ current, steps }: { current: number; steps?: string[] }) {
  const labels = steps ?? ["Purchase order", "Goods receipt", "Supplier bill", "Payment"];
  return (
    <ol className="no-print flex flex-wrap items-center gap-1.5 text-xs">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 font-medium ring-1 ring-inset",
              i === current ? "bg-primary text-primary-foreground ring-primary" : i < current ? "bg-primary/10 text-primary ring-primary/20" : "text-muted-foreground ring-border"
            )}
          >
            {l}
          </span>
          {i < labels.length - 1 && <ArrowRight className="size-3 text-muted-foreground" />}
        </li>
      ))}
    </ol>
  );
}
