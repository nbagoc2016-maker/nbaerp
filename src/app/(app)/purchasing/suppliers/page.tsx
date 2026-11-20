import Link from "next/link";
import { AlertTriangle, CalendarClock, Plus, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { SuppliersTable } from "@/components/purchasing/tables";
import { can, requirePermission } from "@/server/auth";
import { listSuppliers, supplierKpis } from "@/server/queries/suppliers";

export default async function SuppliersPage() {
  const user = await requirePermission("parties.view");
  const [rows, kpi] = await Promise.all([listSuppliers(), supplierKpis()]);
  const canManage = can(user, "parties.manage");

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Mills and traders you buy from, with what you owe each one straight from the ledger."
        actions={
          canManage && (
            <Button asChild>
              <Link href="/purchasing/suppliers/new">
                <Plus className="size-4" />
                Add supplier
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total payable"
          value={formatMoney(kpi.totalPayable)}
          icon={Wallet}
          hint={`${kpi.suppliersOwed} supplier${kpi.suppliersOwed === 1 ? "" : "s"} owed${kpi.advances ? ` · ${formatMoney(kpi.advances)} in advances` : ""}`}
        />
        <StatCard label="Due in the next 7 days" value={formatMoney(kpi.dueWeek)} icon={CalendarClock} tone="warning" hint={`${kpi.dueWeekCount} bill${kpi.dueWeekCount === 1 ? "" : "s"}`} />
        <StatCard label="Overdue" value={formatMoney(kpi.overdue)} icon={AlertTriangle} tone="danger" hint={`${kpi.overdueCount} bill${kpi.overdueCount === 1 ? "" : "s"} past due`} />
      </div>
      <SuppliersTable data={rows} canCreate={canManage} />
    </>
  );
}
