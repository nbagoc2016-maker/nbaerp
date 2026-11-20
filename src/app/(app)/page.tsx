import Link from "next/link";
import { Banknote, Boxes, CircleDollarSign, HandCoins, Landmark, Percent, Receipt, TrendingUp } from "lucide-react";
import { QUICK_CREATE } from "@/config/quick-create";
import { APP_TIME_ZONE, formatDate, formatMoney, formatNumber, today } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { CashFlowChart, CategoryDonut, SalesTrendChart, TopProductsChart } from "@/components/dashboard/charts";
import { LowStock, NoWidgets, OverdueReceivables, PendingApprovals, RecentInvoices } from "@/components/dashboard/panels";
import { can, requirePermission } from "@/server/auth";
import { getDashboard } from "@/server/queries/dashboard";

export const metadata = { title: "Dashboard" };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: APP_TIME_ZONE }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const VS = "vs last month";

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const access = {
    sales: can(user, "sales.view"),
    finance: can(user, "accounting.view"),
    stockValue: can(user, "inventory.cost"),
    inventory: can(user, "inventory.view"),
    purchasing: can(user, ["purchasing.approve", "purchasing.view"]),
    leave: can(user, "hr.attendance"),
  };
  const d = await getDashboard(access);
  const k = d.kpis;
  const firstName = user.name.split(" ")[0];
  const quick = QUICK_CREATE.filter((q) => !q.permission || hasPermission(user.permissions, q.permission)).slice(0, 4);
  const dayLong = new Date(`${today()}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const monthName = new Date(`${today()}T12:00:00`).toLocaleDateString("en-GB", { month: "long" });

  const cards = [
    k.sales && (
      <StatCard
        key="sales"
        label={`Sales in ${monthName}`}
        value={formatMoney(k.sales.value)}
        icon={TrendingUp}
        change={k.sales.change != null ? { value: k.sales.change, label: VS } : null}
        hint={k.sales.change == null ? `${formatNumber(k.sales.invoices)} invoice${k.sales.invoices === 1 ? "" : "s"}, net of returns` : `· ${formatNumber(k.sales.invoices)} inv.`}
      />
    ),
    k.grossProfit && (
      <StatCard
        key="gp"
        label="Gross profit"
        value={formatMoney(k.grossProfit.value)}
        icon={Percent}
        tone="success"
        change={k.grossProfit.change != null ? { value: k.grossProfit.change, label: VS } : null}
        hint={`${k.grossProfit.margin.toFixed(1)}% margin`}
      />
    ),
    k.netProfit && (
      <StatCard
        key="np"
        label="Net profit this month"
        value={<span className={k.netProfit.value < 0 ? "text-destructive" : undefined}>{formatMoney(k.netProfit.value)}</span>}
        icon={CircleDollarSign}
        tone={k.netProfit.value < 0 ? "danger" : "success"}
        change={k.netProfit.change != null ? { value: k.netProfit.change, label: VS } : null}
        hint={k.netProfit.change == null ? "Income less all expenses (GL)" : undefined}
      />
    ),
    k.expenses && (
      <StatCard
        key="exp"
        label="Expenses this month"
        value={formatMoney(k.expenses.value)}
        icon={Receipt}
        tone="warning"
        change={k.expenses.change != null ? { value: k.expenses.change, invert: true, label: VS } : null}
        hint={k.expenses.change == null ? "Operating expenses, excl. cost of sales" : undefined}
      />
    ),
    k.receivables && (
      <StatCard
        key="ar"
        label="Receivables"
        value={formatMoney(k.receivables.value)}
        icon={HandCoins}
        tone="info"
        change={k.receivables.change != null ? { value: k.receivables.change, invert: true, label: "since month start" } : null}
        hint={k.receivables.change == null ? "Owed by customers" : undefined}
      />
    ),
    k.payables && (
      <StatCard
        key="ap"
        label="Payables"
        value={formatMoney(k.payables.value)}
        icon={Banknote}
        tone="danger"
        change={k.payables.change != null ? { value: k.payables.change, invert: true, label: "since month start" } : null}
        hint={k.payables.change == null ? "Owed to suppliers" : undefined}
      />
    ),
    k.cash && (
      <StatCard
        key="cash"
        label="Cash & bank"
        value={<span className={k.cash.value < 0 ? "text-destructive" : undefined}>{formatMoney(k.cash.value)}</span>}
        icon={Landmark}
        tone="success"
        change={k.cash.change != null ? { value: k.cash.change, label: "since month start" } : null}
        hint={k.cash.change == null ? "Cash, bank & petty cash" : undefined}
      />
    ),
    k.stockValue && (
      <StatCard
        key="stock"
        label="Stock value"
        value={formatMoney(k.stockValue.value)}
        icon={Boxes}
        tone="info"
        hint={`${formatNumber(k.stockValue.products)} product${k.stockValue.products === 1 ? "" : "s"} in stock, at average cost`}
      />
    ),
  ].filter(Boolean);

  const showApprovals = access.purchasing || access.leave;
  const nothing = !cards.length && !access.sales && !access.inventory && !showApprovals;

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title={`${greeting()}, ${firstName}`}
        description={
          <>
            {dayLong}
            <span className="hidden sm:inline"> · here&apos;s how the business is doing</span>
          </>
        }
        actions={quick.map((q, i) => (
          <Button key={q.href} asChild size="sm" variant={i === 0 ? "default" : "outline"}>
            <Link href={q.href}>
              <q.icon className="size-4" />
              {q.title}
            </Link>
          </Button>
        ))}
      />

      {nothing && <NoWidgets />}

      {cards.length > 0 && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards}</div>}

      {(access.sales || access.finance) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {access.sales && (
            <>
              <div className="min-w-0 lg:col-span-2">
                <SalesTrendChart daily={d.trendDaily} monthly={d.trendMonthly} showProfit={access.finance} />
              </div>
              <div className="min-w-0">
                <CategoryDonut data={d.byCategory} />
              </div>
            </>
          )}
          {access.sales && (
            <div className={access.finance ? "min-w-0 lg:col-span-1" : "min-w-0 lg:col-span-3"}>
              <TopProductsChart data={d.topProducts} />
            </div>
          )}
          {access.finance && (
            <div className={access.sales ? "min-w-0 lg:col-span-2" : "min-w-0 lg:col-span-3"}>
              <CashFlowChart data={d.cashFlow} />
            </div>
          )}
        </div>
      )}

      {(access.sales || access.inventory || showApprovals) && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {access.sales && <RecentInvoices rows={d.recentInvoices} />}
          {access.sales && <OverdueReceivables data={d.overdue} />}
          {access.inventory && <LowStock data={d.lowStock} />}
          {showApprovals && <PendingApprovals data={d.approvals} showPurchasing={access.purchasing} showLeave={access.leave} />}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Figures from posted documents and journals · month to date compared with {formatDate(d.period.prevFrom)} – {formatDate(d.period.prevTo)}
      </p>
    </div>
  );
}
