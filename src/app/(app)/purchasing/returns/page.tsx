import Link from "next/link";
import { FileClock, Plus, Undo2 } from "lucide-react";
import { formatMoney, startOfMonth, today } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ReturnsTable } from "@/components/purchasing/tables";
import { can, requirePermission } from "@/server/auth";
import { listReturns } from "@/server/queries/purchasing";

export default async function ReturnsPage() {
  const user = await requirePermission("purchasing.view");
  const rows = await listReturns();
  const month = startOfMonth(today());
  const posted = rows.filter((r) => r.status === "posted");
  const thisMonth = posted.filter((r) => r.date >= month);
  const drafts = rows.filter((r) => r.status === "draft").length;
  const canCreate = can(user, "purchasing.create");

  return (
    <>
      <PageHeader
        title="Purchase returns"
        description="Goods sent back to suppliers. Each return takes the stock out and reduces what you owe."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/purchasing/returns/new">
                <Plus className="size-4" />
                New return
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Returned this month" value={formatMoney(thisMonth.reduce((t, r) => t + r.total, 0))} icon={Undo2} hint={`${thisMonth.length} return${thisMonth.length === 1 ? "" : "s"}`} />
        <StatCard label="Returned all time" value={formatMoney(posted.reduce((t, r) => t + r.total, 0))} icon={Undo2} tone="info" hint={`${posted.length} posted`} />
        <StatCard label="Draft returns" value={drafts} icon={FileClock} tone="warning" hint="Not yet posted" />
      </div>
      <ReturnsTable data={rows} canCreate={canCreate} />
    </>
  );
}
