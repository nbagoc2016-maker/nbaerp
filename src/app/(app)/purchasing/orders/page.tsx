import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardList, FileCheck2, HandCoins, PackageCheck, Plus, ShoppingCart, type LucideIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { PurchaseOrdersTable } from "@/components/purchasing/tables";
import { can, requirePermission } from "@/server/auth";
import { listPurchaseOrders, purchasingKpis } from "@/server/queries/purchasing";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function FlowStep({ href, icon: Icon, title, detail, step }: { href: string; icon: LucideIcon; title: string; detail: string; step: number }) {
  return (
    <Link href={href} className="group">
      <Card className="h-full gap-0 py-0 transition-colors group-hover:border-primary/40 group-hover:bg-primary/5">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Step {step}</p>
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function PurchaseOrdersPage() {
  const user = await requirePermission("purchasing.view");
  const [rows, kpi] = await Promise.all([listPurchaseOrders(), purchasingKpis()]);
  const canCreate = can(user, "purchasing.create");

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Order from suppliers, receive the goods, enter their bills and pay them, all from one place."
        actions={
          <>
            {canCreate && (
              <Button asChild variant="outline">
                <Link href="/purchasing/receipts/new">
                  <PackageCheck className="size-4" />
                  Receive goods
                </Link>
              </Button>
            )}
            {canCreate && (
              <Button asChild>
                <Link href="/purchasing/orders/new">
                  <Plus className="size-4" />
                  New purchase order
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open purchase orders" value={formatMoney(kpi.openPoValue)} icon={ShoppingCart} hint={`${plural(kpi.openPoCount, "order")} still to receive`} />
        <StatCard label="Received, not billed" value={formatMoney(kpi.unbilledValue)} icon={PackageCheck} tone="info" hint={`${plural(kpi.unbilledCount, "receipt")} waiting for a bill`} />
        <StatCard label="Payables due in 7 days" value={formatMoney(kpi.dueWeek)} icon={CalendarClock} tone="warning" hint={plural(kpi.dueWeekCount, "bill")} />
        <StatCard label="Overdue payables" value={formatMoney(kpi.overdue)} icon={AlertTriangle} tone="danger" hint={plural(kpi.overdueCount, "bill")} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FlowStep step={1} href={canCreate ? "/purchasing/orders/new" : "/purchasing/orders"} icon={ClipboardList} title="Order" detail={kpi.draftPoCount ? `${plural(kpi.draftPoCount, "draft")} to approve` : "Raise a purchase order"} />
        <FlowStep step={2} href="/purchasing/receipts" icon={PackageCheck} title="Receive" detail={`${plural(kpi.openPoCount, "order")} awaiting delivery`} />
        <FlowStep step={3} href="/purchasing/bills" icon={FileCheck2} title="Bill" detail={`${plural(kpi.unbilledCount, "receipt")} to bill`} />
        <FlowStep step={4} href="/purchasing/payments" icon={HandCoins} title="Pay" detail={`${plural(kpi.openBillCount, "open bill")} · ${formatMoney(kpi.openBills)}`} />
      </div>

      <PurchaseOrdersTable data={rows} canCreate={canCreate} />
    </>
  );
}
