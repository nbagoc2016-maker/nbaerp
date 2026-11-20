import Link from "next/link";
import { AlertTriangle, Banknote, CalendarClock, Plus, Wallet } from "lucide-react";
import { formatMoney, startOfMonth, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { PaymentsTable } from "@/components/purchasing/tables";
import { can, requirePermission } from "@/server/auth";
import { listPayments, purchasingKpis } from "@/server/queries/purchasing";

export default async function PaymentsPage() {
  const user = await requirePermission(["purchasing.payments", "purchasing.view"]);
  const [rows, kpi] = await Promise.all([listPayments(), purchasingKpis()]);
  const month = startOfMonth(today());
  const paidThisMonth = rows.filter((r) => r.status === "posted" && r.date >= month);
  const canPay = can(user, "purchasing.payments");

  return (
    <>
      <PageHeader
        title="Supplier payments"
        description="Money paid to suppliers from cash and bank, and the bills each payment settled."
        actions={
          canPay && (
            <Button asChild>
              <Link href="/purchasing/payments/new">
                <Plus className="size-4" />
                Record payment
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Paid this month" value={formatMoney(paidThisMonth.reduce((t, r) => t + r.amount, 0))} icon={Banknote} tone="success" hint={`${paidThisMonth.length} payment${paidThisMonth.length === 1 ? "" : "s"}`} />
        <StatCard label="Unpaid bills" value={formatMoney(kpi.openBills)} icon={Wallet} hint={`${kpi.openBillCount} open`} />
        <StatCard label="Due in 7 days" value={formatMoney(kpi.dueWeek)} icon={CalendarClock} tone="warning" hint={`${kpi.dueWeekCount} bill${kpi.dueWeekCount === 1 ? "" : "s"}`} />
        <StatCard label="Overdue" value={formatMoney(kpi.overdue)} icon={AlertTriangle} tone="danger" hint={`${kpi.overdueCount} bill${kpi.overdueCount === 1 ? "" : "s"}`} />
      </div>
      <PaymentsTable data={rows} canCreate={canPay} />
    </>
  );
}
