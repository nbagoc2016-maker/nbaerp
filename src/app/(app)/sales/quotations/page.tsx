import Link from "next/link";
import { CheckCircle2, FileText, Plus, Send } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatCard } from "@/components/app/stat-card";
import { QuotationsTable } from "@/components/sales/tables";
import { Button } from "@/components/ui/button";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { listQuotations } from "@/server/queries/sales";

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission("sales.view");
  const period = readPeriod(await searchParams);
  const company = await getCompany();
  const rows = await listQuotations(period.from, period.to);
  const open = rows.filter((r) => r.displayStatus === "draft" || r.displayStatus === "sent");
  const won = rows.filter((r) => r.status === "accepted" || r.status === "converted");
  const decided = rows.filter((r) => ["accepted", "converted", "rejected"].includes(r.status)).length;

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Priced offers for customers, ready to turn into orders or invoices."
        actions={
          can(user, "sales.create") && (
            <Button asChild>
              <Link href="/sales/quotations/new">
                <Plus className="size-4" />
                New quotation
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Quoted this period" value={<Money value={rows.reduce((s, r) => s + r.total, 0)} />} icon={FileText} hint={`${rows.length} quotation${rows.length === 1 ? "" : "s"}`} />
        <StatCard label="Awaiting answer" value={<Money value={open.reduce((s, r) => s + r.total, 0)} />} icon={Send} tone="info" hint={`${open.length} open`} />
        <StatCard
          label="Won"
          value={<Money value={won.reduce((s, r) => s + r.total, 0)} />}
          icon={CheckCircle2}
          tone="success"
          hint={decided ? `${Math.round((won.length / decided) * 100)}% win rate` : "No decisions yet"}
        />
      </div>
      <div className="mb-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <QuotationsTable data={rows} />
    </>
  );
}
