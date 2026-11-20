import Link from "next/link";
import { ClipboardCheck, ClipboardList, Plus, Scale } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { CountsTable } from "@/components/inventory/doc-tables";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { listCounts } from "@/server/queries/inventory";

export default async function CountsPage() {
  const user = await requirePermission("inventory.view");
  const canCreate = can(user, "inventory.adjust");
  const canCost = can(user, "inventory.cost");
  const rows = await listCounts();
  const open = rows.filter((r) => r.status === "counting");
  const lastPosted = rows.find((r) => r.status === "posted");
  return (
    <>
      <PageHeader
        title="Stock counts"
        description="Physical stock takes: compare what is on the shelf with the system and post the differences."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/inventory/counts/new">
                <Plus className="size-4" />
                Start a count
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="In progress" value={formatNumber(open.length)} hint={open.map((o) => o.warehouse).join(", ") || "No open counts"} icon={ClipboardList} tone="info" />
        <StatCard label="Last posted" value={lastPosted ? formatDate(lastPosted.date) : "—"} hint={lastPosted ? `${lastPosted.number} · ${lastPosted.warehouse}` : "No counts posted yet"} icon={ClipboardCheck} tone="success" />
        {canCost && lastPosted && (
          <StatCard label="Last variance" value={formatMoney(lastPosted.varianceValue)} hint={`${lastPosted.variances} item(s) differed`} icon={Scale} tone={lastPosted.varianceValue < 0 ? "danger" : "success"} className="col-span-2 lg:col-span-1" />
        )}
      </div>
      <CountsTable data={rows.map((r) => ({ ...r, varianceValue: canCost ? r.varianceValue : null }))} canCreate={canCreate} canCost={canCost} />
    </>
  );
}
