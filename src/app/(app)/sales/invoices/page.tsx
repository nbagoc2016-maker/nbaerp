import Link from "next/link";
import { AlertTriangle, Clock, Percent, Plus, ReceiptText, TrendingUp } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatCard } from "@/components/app/stat-card";
import { InvoicesTable } from "@/components/sales/tables";
import { UrlSelect } from "@/components/sales/url-filters";
import { Button } from "@/components/ui/button";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { invoiceKpis, listInvoices } from "@/server/queries/sales";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string; payment?: string; channel?: string }>;
}) {
  const user = await requirePermission("sales.view");
  const sp = await searchParams;
  const period = readPeriod(sp);
  const company = await getCompany();
  const [rows, k] = await Promise.all([
    listInvoices({ ...period, status: sp.status, payment: sp.payment, channel: sp.channel }),
    invoiceKpis(period.from, period.to),
  ]);
  const showCost = can(user, "inventory.cost");

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Everything you've billed, from the counter and the office."
        actions={
          <>
            {can(user, "sales.pos") && (
              <Button asChild variant="outline">
                <Link href="/sales/pos">Open POS</Link>
              </Button>
            )}
            {can(user, "sales.create") && (
              <Button asChild>
                <Link href="/sales/invoices/new">
                  <Plus className="size-4" />
                  New invoice
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales this period" value={<Money value={k.sales} />} icon={TrendingUp} hint={`${k.count} posted invoice${k.count === 1 ? "" : "s"}`} />
        {showCost ? (
          <StatCard label="Gross margin" value={`${k.margin.toFixed(1)}%`} icon={Percent} tone="success" hint="Sales less cost of goods, before tax" />
        ) : (
          <StatCard label="Average sale" value={<Money value={k.count ? k.sales / k.count : 0} />} icon={ReceiptText} tone="info" />
        )}
        <StatCard label="Unpaid" value={<Money value={k.unpaid} />} icon={Clock} tone="warning" hint={`${k.unpaidCount} open invoice${k.unpaidCount === 1 ? "" : "s"}, all dates`} />
        <StatCard
          label="Overdue"
          value={<Money value={k.overdue} />}
          icon={AlertTriangle}
          tone={k.overdue > 0 ? "danger" : "success"}
          hint={`${k.overdueCount} past due date`}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
        <UrlSelect
          param="status"
          value={sp.status}
          placeholder="All statuses"
          options={[
            { value: "draft", label: "Draft" },
            { value: "posted", label: "Posted" },
            { value: "void", label: "Void" },
          ]}
        />
        <UrlSelect
          param="payment"
          value={sp.payment}
          placeholder="Any payment"
          options={[
            { value: "unpaid", label: "Unpaid" },
            { value: "partial", label: "Part paid" },
            { value: "paid", label: "Paid" },
            { value: "overdue", label: "Overdue" },
          ]}
        />
        <UrlSelect
          param="channel"
          value={sp.channel}
          placeholder="POS & invoices"
          options={[
            { value: "invoice", label: "Invoices only" },
            { value: "pos", label: "POS sales only" },
          ]}
        />
      </div>
      <InvoicesTable data={rows} />
    </>
  );
}
