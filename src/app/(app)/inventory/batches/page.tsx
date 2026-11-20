import { Layers, Ruler, Scissors } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { BatchesTable } from "@/components/inventory/batches-table";
import { UrlCombobox, UrlSelect, UrlSwitch } from "@/components/inventory/url-filters";
import { formatNumber } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { activeWarehouses, listBatches } from "@/server/queries/inventory";

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ product?: string; warehouse?: string; all?: string }> }) {
  const user = await requirePermission("inventory.view");
  const sp = await searchParams;
  const canCost = can(user, "inventory.cost");
  const [batches, warehouses] = await Promise.all([listBatches(), activeWarehouses()]);
  const showAll = sp.all === "1";

  const products = new Map<string, { label: string; hint: string }>();
  for (const b of batches) products.set(b.productId, { label: b.product, hint: b.sku });

  const rows = batches
    .filter((b) => (!sp.product || b.productId === sp.product) && (!sp.warehouse || b.warehouseId === sp.warehouse) && (showAll || b.qty > 0))
    .map((b) => ({ ...b, unitCost: canCost ? b.unitCost : null }));
  const open = batches.filter((b) => b.qty > 0 && (!sp.product || b.productId === sp.product) && (!sp.warehouse || b.warehouseId === sp.warehouse));
  const partial = open.filter((b) => b.qty < b.initialQty).length;

  return (
    <>
      <PageHeader title="Rolls & batches" description="Every thaan or lot with its own number, shade and remaining length." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Open rolls" value={formatNumber(open.length)} hint="With stock left" icon={Layers} />
        <StatCard label="Cut / partly used" value={formatNumber(partial)} hint="Some length already sold" icon={Scissors} tone="warning" />
        <StatCard label="Products tracked" value={formatNumber(new Set(open.map((b) => b.productId)).size)} icon={Ruler} tone="info" className="col-span-2 lg:col-span-1" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <UrlCombobox name="product" value={sp.product} placeholder="All products" options={[...products].map(([value, p]) => ({ value, label: p.label, hint: p.hint }))} />
        <UrlSelect name="warehouse" value={sp.warehouse} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} allLabel="All warehouses" />
        <UrlSwitch name="all" checked={showAll} label="Show used-up rolls" />
      </div>
      <BatchesTable rows={rows} canCost={canCost} />
    </>
  );
}
