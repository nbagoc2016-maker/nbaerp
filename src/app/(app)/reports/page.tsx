import Link from "next/link";
import { ArrowUpRight, LineChart } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { REPORT_GROUPS, REPORTS, canSeeReport } from "@/components/reports/registry";
import { requirePermission } from "@/server/auth";

export const metadata = { title: "Reports" };

function ReportCard({ href, title, description, icon: Icon }: { href: string; title: string; description: string; icon: typeof LineChart }) {
  return (
    <Link
      href={href}
      className="group flex h-full items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center gap-1 font-medium">
          {title}
          <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
    </Link>
  );
}

export default async function ReportsPage() {
  const user = await requirePermission("reports.view");
  const visible = REPORTS.filter((r) => canSeeReport(user.permissions, r));
  const showStatements = hasPermission(user.permissions, "accounting.view");

  return (
    <>
      <PageHeader title="Reports" description="Pick a report. Every report can be filtered, printed and exported to CSV." />
      {visible.length === 0 ? (
        <EmptyState title="No reports available" description="Your role can't see any report yet. Ask an administrator for access." />
      ) : (
        <div className="space-y-8">
          {REPORT_GROUPS.map(({ group, description }) => {
            const items = visible.filter((r) => r.group === group);
            if (!items.length && !(group === "Finance" && showStatements)) return null;
            return (
              <section key={group} className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold">{group}</h2>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((r) => (
                    <ReportCard key={r.slug} href={`/reports/${r.slug}`} title={r.title} description={r.description} icon={r.icon} />
                  ))}
                  {group === "Finance" && showStatements && (
                    <ReportCard
                      href="/accounting/statements"
                      title="Financial statements"
                      description="Trial balance, profit & loss, balance sheet and cash flow (Accounting)."
                      icon={LineChart}
                    />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
