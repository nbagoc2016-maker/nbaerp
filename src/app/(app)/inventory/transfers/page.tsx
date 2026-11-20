import Link from "next/link";
import { ArrowLeftRight, FilePen, Plus, Send } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { TransfersTable } from "@/components/inventory/doc-tables";
import { Button } from "@/components/ui/button";
import { formatNumber, startOfMonth } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { listTransfers } from "@/server/queries/inventory";

export default async function TransfersPage() {
  const user = await requirePermission("inventory.view");
  const canCreate = can(user, "inventory.transfer");
  const rows = await listTransfers();
  const monthStart = startOfMonth();
  const posted = rows.filter((r) => r.status === "posted");
  return (
    <>
      <PageHeader
        title="Stock transfers"
        description="Move stock between warehouses and shops at cost."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/inventory/transfers/new">
                <Plus className="size-4" />
                New transfer
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Drafts" value={formatNumber(rows.filter((r) => r.status === "draft").length)} hint="Waiting to be posted" icon={FilePen} tone="warning" />
        <StatCard label="Posted this month" value={formatNumber(posted.filter((r) => r.date >= monthStart).length)} icon={Send} tone="success" />
        <StatCard label="All posted" value={formatNumber(posted.length)} icon={ArrowLeftRight} className="col-span-2 lg:col-span-1" />
      </div>
      <TransfersTable data={rows} canCreate={canCreate} />
    </>
  );
}
