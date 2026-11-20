import Link from "next/link";
import { Banknote, Plus, RotateCcw, Wallet } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatCard } from "@/components/app/stat-card";
import { ReturnsTable } from "@/components/sales/tables";
import { Button } from "@/components/ui/button";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { listReturns } from "@/server/queries/sales";

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission("sales.view");
  const period = readPeriod(await searchParams);
  const company = await getCompany();
  const rows = await listReturns(period.from, period.to);
  const posted = rows.filter((r) => r.status === "posted");
  const credit = posted.filter((r) => r.settlement === "credit").reduce((s, r) => s + r.total, 0);
  const refund = posted.filter((r) => r.settlement === "refund").reduce((s, r) => s + r.total, 0);

  return (
    <>
      <PageHeader
        title="Sales Returns"
        description="Goods customers brought back, credited or refunded."
        actions={
          can(user, "sales.create") && (
            <Button asChild>
              <Link href="/sales/returns/new">
                <Plus className="size-4" />
                New return
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Returns this period" value={<Money value={credit + refund} />} icon={RotateCcw} tone="warning" hint={`${posted.length} posted`} />
        <StatCard label="Credited to accounts" value={<Money value={credit} />} icon={Wallet} tone="info" />
        <StatCard label="Refunded" value={<Money value={refund} />} icon={Banknote} tone="danger" />
      </div>
      <div className="mb-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <ReturnsTable data={rows} />
    </>
  );
}
