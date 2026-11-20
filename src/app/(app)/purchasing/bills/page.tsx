import Link from "next/link";
import { AlertTriangle, CalendarClock, FileClock, Plus, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { BillsTable } from "@/components/purchasing/tables";
import { can, requirePermission } from "@/server/auth";
import { listBills, purchasingKpis } from "@/server/queries/purchasing";

export default async function BillsPage() {
  const user = await requirePermission("purchasing.view");
  const [rows, kpi] = await Promise.all([listBills(), purchasingKpis()]);
  const canCreate = can(user, "purchasing.create");

  return (
    <>
      <PageHeader
        title="Supplier bills"
        description="Invoices from suppliers. Posted bills add to what you owe; payments and returns settle them."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/purchasing/bills/new">
                <Plus className="size-4" />
                New bill
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unpaid bills" value={formatMoney(kpi.openBills)} icon={Wallet} hint={`${kpi.openBillCount} open bill${kpi.openBillCount === 1 ? "" : "s"}`} />
        <StatCard label="Due in 7 days" value={formatMoney(kpi.dueWeek)} icon={CalendarClock} tone="warning" hint={`${kpi.dueWeekCount} bill${kpi.dueWeekCount === 1 ? "" : "s"}`} />
        <StatCard label="Overdue" value={formatMoney(kpi.overdue)} icon={AlertTriangle} tone="danger" hint={`${kpi.overdueCount} bill${kpi.overdueCount === 1 ? "" : "s"}`} />
        <StatCard label="Received, not billed" value={formatMoney(kpi.unbilledValue)} icon={FileClock} tone="info" hint={`${kpi.unbilledCount} receipt${kpi.unbilledCount === 1 ? "" : "s"} waiting`} />
      </div>
      <BillsTable data={rows} canCreate={canCreate} />
    </>
  );
}
