import Link from "next/link";
import { FilePen, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { AdjustmentsTable } from "@/components/inventory/doc-tables";
import { Button } from "@/components/ui/button";
import { formatMoney, formatNumber, startOfMonth } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { listAdjustments } from "@/server/queries/inventory";

export default async function AdjustmentsPage() {
  const user = await requirePermission("inventory.view");
  const canCreate = can(user, "inventory.adjust");
  const canCost = can(user, "inventory.cost");
  const rows = await listAdjustments();
  const month = rows.filter((r) => r.status === "posted" && r.date >= startOfMonth());
  const gains = month.filter((r) => r.totalValue > 0).reduce((t, r) => t + r.totalValue, 0);
  const losses = month.filter((r) => r.totalValue < 0).reduce((t, r) => t - r.totalValue, 0);
  return (
    <>
      <PageHeader
        title="Stock adjustments"
        description="Write off damage and losses, or add found stock, with the GL updated in the same step."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/inventory/adjustments/new">
                <Plus className="size-4" />
                New adjustment
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Drafts" value={formatNumber(rows.filter((r) => r.status === "draft").length)} hint="Waiting to be posted" icon={FilePen} tone="warning" />
        {canCost ? (
          <>
            <StatCard label="Written off this month" value={formatMoney(losses)} icon={TrendingDown} tone="danger" />
            <StatCard label="Added this month" value={formatMoney(gains)} icon={TrendingUp} tone="success" className="col-span-2 lg:col-span-1" />
          </>
        ) : (
          <StatCard label="Posted this month" value={formatNumber(month.length)} icon={TrendingUp} tone="success" />
        )}
      </div>
      <AdjustmentsTable data={rows.map((r) => ({ ...r, totalValue: canCost ? r.totalValue : null }))} canCreate={canCreate} canCost={canCost} />
    </>
  );
}
