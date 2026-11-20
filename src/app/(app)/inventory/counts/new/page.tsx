import { PageHeader } from "@/components/app/page-header";
import { NewCountForm } from "@/components/inventory/new-count-form";
import { requirePermission } from "@/server/auth";
import { activeWarehouses } from "@/server/queries/inventory";
import { categoryTree } from "@/server/queries/products";

export default async function NewCountPage({ searchParams }: { searchParams: Promise<{ warehouse?: string }> }) {
  await requirePermission("inventory.adjust");
  const sp = await searchParams;
  const [warehouses, categories] = await Promise.all([activeWarehouses(), categoryTree()]);
  const def = warehouses.find((w) => w.id === sp.warehouse) ?? warehouses.find((w) => w.isDefault) ?? warehouses[0];
  return (
    <>
      <PageHeader title="Start a stock count" description="Physical stock take for one warehouse." backHref="/inventory/counts" />
      <NewCountForm
        warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
        categories={categories.map((c) => ({ value: c.id, label: c.path }))}
        defaultWarehouseId={def?.id ?? ""}
      />
    </>
  );
}
