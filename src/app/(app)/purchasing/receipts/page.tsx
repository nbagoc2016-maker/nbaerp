import Link from "next/link";
import { FileClock, PackageCheck, Plus, ShoppingCart } from "lucide-react";
import { formatMoney, startOfMonth, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ReceiptsTable } from "@/components/purchasing/tables";
import { can, requirePermission } from "@/server/auth";
import { listReceipts, purchasingKpis } from "@/server/queries/purchasing";

export default async function ReceiptsPage() {
  const user = await requirePermission("purchasing.view");
  const [rows, kpi] = await Promise.all([listReceipts(), purchasingKpis()]);
  const month = startOfMonth(today());
  const thisMonth = rows.filter((r) => r.status === "posted" && r.date >= month);
  const drafts = rows.filter((r) => r.status === "draft").length;
  const canCreate = can(user, "purchasing.create");

  return (
    <>
      <PageHeader
        title="Goods receipts"
        description="Deliveries received into your warehouses. Each receipt adds stock and waits for the supplier's bill."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/purchasing/receipts/new">
                <Plus className="size-4" />
                Receive goods
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Received this month" value={formatMoney(thisMonth.reduce((t, r) => t + r.totalValue, 0))} icon={PackageCheck} hint={`${thisMonth.length} receipt${thisMonth.length === 1 ? "" : "s"}`} />
        <StatCard label="Received, not billed" value={formatMoney(kpi.unbilledValue)} icon={FileClock} tone="info" hint={`${kpi.unbilledCount} receipt${kpi.unbilledCount === 1 ? "" : "s"} to bill`} />
        <StatCard label="Orders awaiting delivery" value={kpi.openPoCount} icon={ShoppingCart} tone="warning" hint={formatMoney(kpi.openPoValue)} />
        <StatCard label="Draft receipts" value={drafts} icon={PackageCheck} hint="Not yet posted to stock" />
      </div>
      <ReceiptsTable data={rows} canCreate={canCreate} />
    </>
  );
}
