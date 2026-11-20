import Link from "next/link";
import { Plus, Receipt, Tags, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatCard } from "@/components/app/stat-card";
import { fmtAmount } from "@/components/accounting/amount";
import { ExpenseChart } from "@/components/accounting/expense-chart";
import { ExpensesTable } from "@/components/accounting/expenses-table";
import { UrlSelect } from "@/components/accounting/url-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, endOfMonth, formatDate, monthLabel, round2, startOfMonth, today } from "@/lib/format";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { expensesByCategory, listExpenses } from "@/server/queries/accounting";
import { getCompany } from "@/server/queries/company";
import { pctChange } from "@/server/services/finance-shared";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; category?: string }> }) {
  const user = await requirePermission(["accounting.expenses", "accounting.view"]);
  const sp = await searchParams;
  const period = readPeriod(sp);
  const thisMonth = { from: startOfMonth(), to: endOfMonth() };
  const lastMonthEnd = addDays(thisMonth.from, -1);
  const lastMonth = { from: startOfMonth(lastMonthEnd), to: lastMonthEnd };
  const [rows, byCat, thisCats, lastCats, company] = await Promise.all([
    listExpenses({ ...period, status: sp.status, accountId: sp.category }),
    expensesByCategory(period),
    expensesByCategory(thisMonth),
    expensesByCategory(lastMonth),
    getCompany(),
  ]);
  const sum = (c: { total: number }[]) => round2(c.reduce((s, x) => s + x.total, 0));
  const thisTotal = sum(thisCats);
  const lastTotal = sum(lastCats);
  const change = pctChange(thisTotal, lastTotal);
  const top = thisCats[0];
  const periodTotal = sum(byCat);
  const posted = rows.filter((r) => r.status === "posted");
  const periodTax = round2(posted.reduce((s, r) => s + r.taxAmount, 0));
  const canCreate = can(user, "accounting.expenses");

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Spending paid straight from cash, bank or petty cash."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/accounting/expenses/new">
                <Plus className="size-4" />
                Record expense
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={`This month (${monthLabel(today().slice(0, 7))})`}
          value={fmtAmount(thisTotal)}
          icon={Wallet}
          change={change === null ? null : { value: change, invert: true, label: "vs last month" }}
          hint={change === null ? "No spending last month" : undefined}
        />
        <StatCard label="Last month" value={fmtAmount(lastTotal)} icon={Receipt} hint={monthLabel(lastMonth.from.slice(0, 7))} />
        <StatCard label="Top category this month" value={top ? top.name : "—"} icon={Tags} hint={top ? `${fmtAmount(top.total)} · ${thisTotal ? ((top.total / thisTotal) * 100).toFixed(0) : 0}% of spend` : undefined} />
        <StatCard label="Selected period" value={fmtAmount(periodTotal)} icon={TrendingUp} hint={periodTax ? `+ ${fmtAmount(periodTax)} input tax` : `${posted.length} expenses`} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Spending by category</CardTitle>
          <CardDescription>
            {formatDate(period.from)} to {formatDate(period.to)}, before tax
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExpenseChart data={byCat.map((c) => ({ name: c.name, total: c.total }))} />
        </CardContent>
      </Card>

      <div className="mb-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <ExpensesTable
        data={rows}
        canCreate={canCreate}
        toolbar={
          <>
            {byCat.length > 1 && (
              <UrlSelect param="category" value={sp.category} allLabel="All categories" label="Category" className="w-52" options={byCat.map((c) => ({ value: c.accountId, label: c.name }))} />
            )}
            <UrlSelect
              param="status"
              value={sp.status}
              allLabel="Any status"
              label="Status"
              className="w-36"
              options={[
                { value: "posted", label: "Posted" },
                { value: "void", label: "Void" },
              ]}
            />
          </>
        }
      />
    </>
  );
}
