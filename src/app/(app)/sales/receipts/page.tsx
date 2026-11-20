import Link from "next/link";
import { Banknote, HandCoins, Landmark, Plus } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatCard } from "@/components/app/stat-card";
import { ReceiptsTable } from "@/components/sales/tables";
import { Button } from "@/components/ui/button";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { listReceipts } from "@/server/queries/sales";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission(["sales.receipts", "sales.view"]);
  const period = readPeriod(await searchParams);
  const company = await getCompany();
  const rows = await listReceipts(period.from, period.to);
  const posted = rows.filter((r) => r.status === "posted");
  const total = posted.reduce((s, r) => s + r.amount, 0);
  const cash = posted.filter((r) => r.method === "cash").reduce((s, r) => s + r.amount, 0);
  const onAccount = posted.reduce((s, r) => s + Math.max(0, r.unallocated), 0);

  return (
    <>
      <PageHeader
        title="Receipts"
        description="Money received from customers, and which invoices it settled."
        actions={
          can(user, "sales.receipts") && (
            <Button asChild>
              <Link href="/sales/receipts/new">
                <Plus className="size-4" />
                Record receipt
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Received this period" value={<Money value={total} />} icon={HandCoins} tone="success" hint={`${posted.length} receipt${posted.length === 1 ? "" : "s"}`} />
        <StatCard label="In cash" value={<Money value={cash} />} icon={Banknote} hint={`${formatShare(cash, total)} of receipts`} />
        <StatCard label="Bank, card & other" value={<Money value={total - cash} />} icon={Landmark} tone="info" hint={onAccount > 0 ? `${Math.round(onAccount).toLocaleString()} kept on account` : "All applied to invoices"} />
      </div>
      <div className="mb-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <ReceiptsTable data={rows} />
    </>
  );
}

function formatShare(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}
