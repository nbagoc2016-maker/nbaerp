import Link from "next/link";
import { ClipboardList, PackageCheck, Plus, Truck } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { PeriodFilter } from "@/components/app/period-filter";
import { StatCard } from "@/components/app/stat-card";
import { OrdersTable } from "@/components/sales/tables";
import { Button } from "@/components/ui/button";
import { readPeriod } from "@/lib/period";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { listOrders } from "@/server/queries/sales";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePermission("sales.view");
  const period = readPeriod(await searchParams);
  const company = await getCompany();
  const rows = await listOrders(period.from, period.to);
  const open = rows.filter((r) => r.status === "confirmed" || r.status === "partial");
  const openValue = open.reduce((s, r) => s + r.total * (1 - r.fulfilledPct / 100), 0);
  const fulfilled = rows.filter((r) => r.status === "fulfilled").length;

  return (
    <>
      <PageHeader
        title="Sales Orders"
        description="Customer bookings, invoiced in full or in parts as you deliver."
        actions={
          can(user, "sales.create") && (
            <Button asChild>
              <Link href="/sales/orders/new">
                <Plus className="size-4" />
                New sales order
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Booked this period" value={<Money value={rows.filter((r) => r.status !== "cancelled").reduce((s, r) => s + r.total, 0)} />} icon={ClipboardList} hint={`${rows.length} order${rows.length === 1 ? "" : "s"}`} />
        <StatCard label="Still to deliver" value={<Money value={openValue} />} icon={Truck} tone="warning" hint={`${open.length} open order${open.length === 1 ? "" : "s"}`} />
        <StatCard label="Fulfilled" value={fulfilled} icon={PackageCheck} tone="success" hint="Fully invoiced" />
      </div>
      <div className="mb-3">
        <PeriodFilter from={period.from} to={period.to} fiscalStartMonth={company.fiscalYearStartMonth} />
      </div>
      <OrdersTable data={rows} />
    </>
  );
}
