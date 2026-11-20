import Link from "next/link";
import { Boxes, Coins, PackageX, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { stockState } from "@/components/inventory/shared";
import { ReorderTable, StockOnHandTable, type ReorderRow, type StockRow } from "@/components/inventory/stock-tables";
import { UrlSelect, UrlSwitch } from "@/components/inventory/url-filters";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, formatNumber, formatQty } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { stockMatrix } from "@/server/queries/inventory";

const r2 = (n: number) => Math.round(n * 100) / 100;

export default async function StockPage({ searchParams }: { searchParams: Promise<{ warehouse?: string; view?: string; low?: string }> }) {
  const user = await requirePermission("inventory.view");
  const sp = await searchParams;
  const canCost = can(user, "inventory.cost");
  const view = sp.view === "reorder" ? "reorder" : "onhand";
  const { warehouses, rows: all } = await stockMatrix();
  const warehouseId = warehouses.some((w) => w.id === sp.warehouse) ? sp.warehouse! : null;

  // Narrow to one warehouse: qty/value/avg from that warehouse only
  const rows: StockRow[] = all.map((r) => {
    const qty = warehouseId ? (r.per[warehouseId]?.qty ?? 0) : r.qty;
    const value = warehouseId ? r2((r.per[warehouseId]?.qty ?? 0) * (r.per[warehouseId]?.avgCost ?? 0)) : r.value;
    const avgCost = warehouseId ? (r.per[warehouseId]?.avgCost ?? 0) : r.avgCost;
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      category: r.category,
      brand: r.brand,
      reorderLevel: r.reorderLevel,
      reorderQty: r.reorderQty,
      per: Object.fromEntries(Object.entries(r.per).map(([k, v]) => [k, v.qty])),
      qty,
      avgCost: canCost ? avgCost : null,
      value: canCost ? value : null,
    };
  });
  const lowOnly = sp.low === "1";
  const shown = lowOnly ? rows.filter((r) => stockState(r.qty, r.reorderLevel) !== "in") : rows;

  const totalValue = rows.reduce((t, r) => t + (r.value ?? 0), 0);
  const totalQty = rows.reduce((t, r) => t + r.qty, 0);
  const low = rows.filter((r) => stockState(r.qty, r.reorderLevel) === "low").length;
  const out = rows.filter((r) => stockState(r.qty, r.reorderLevel) === "out").length;

  const reorder: ReorderRow[] = all
    .filter((r) => r.isActive && r.reorderLevel > 0 && r.qty <= r.reorderLevel)
    .map((r) => {
      // Order the reorder quantity, but always enough to get back above the reorder level
      const suggested = Math.max(r.reorderQty, r.reorderLevel - r.qty + (r.reorderQty > 0 ? 0 : r.reorderLevel));
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        category: r.category,
        qty: r.qty,
        reorderLevel: r.reorderLevel,
        reorderQty: r.reorderQty,
        suggested: Math.ceil(suggested * 1000) / 1000,
        estCost: canCost ? r2(suggested * (r.costPrice || r.avgCost)) : null,
      };
    })
    .sort((a, b) => a.qty / (a.reorderLevel || 1) - b.qty / (b.reorderLevel || 1));

  const whName = warehouseId ? warehouses.find((w) => w.id === warehouseId)?.name : null;
  const tabHref = (v: string) => {
    const q = new URLSearchParams();
    if (warehouseId) q.set("warehouse", warehouseId);
    if (v === "reorder") q.set("view", "reorder");
    const s = q.toString();
    return s ? `/inventory/stock?${s}` : "/inventory/stock";
  };

  return (
    <>
      <PageHeader title="Stock on hand" description={whName ? `Quantities and value in ${whName}.` : "Quantities and value across every warehouse."} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items in stock" value={formatNumber(rows.filter((r) => r.qty > 0).length)} hint={`${formatQty(totalQty)} units in total`} icon={Boxes} />
        {canCost ? (
          <StatCard label="Stock value" value={formatMoney(totalValue)} hint="At moving-average cost" icon={Coins} tone="info" />
        ) : (
          <StatCard label="Warehouses" value={formatNumber(warehouses.length)} icon={Coins} tone="info" />
        )}
        <StatCard label="Low stock" value={formatNumber(low)} hint="At or below reorder level" icon={TriangleAlert} tone="warning" />
        <StatCard label="Out of stock" value={formatNumber(out)} icon={PackageX} tone="danger" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={view}>
          <TabsList>
            <TabsTrigger value="onhand" asChild>
              <Link href={tabHref("onhand")}>On hand</Link>
            </TabsTrigger>
            <TabsTrigger value="reorder" asChild>
              <Link href={tabHref("reorder")}>Reorder suggestions{reorder.length ? ` (${reorder.length})` : ""}</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {view === "onhand" && (
          <>
            <UrlSelect name="warehouse" value={warehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} allLabel="All warehouses" />
            <UrlSwitch name="low" checked={lowOnly} label="Low / out only" />
          </>
        )}
      </div>

      {view === "onhand" ? (
        <StockOnHandTable rows={shown} warehouses={warehouses} warehouseId={warehouseId} canCost={canCost} />
      ) : (
        <ReorderTable rows={reorder} canCost={canCost} canPurchase={can(user, "purchasing.create")} />
      )}
    </>
  );
}
