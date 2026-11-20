import { PageHeader } from "@/components/app/page-header";
import { AdjustmentForm } from "@/components/inventory/stock-doc-forms";
import { today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { docFormData } from "@/server/queries/inventory";

export default async function NewAdjustmentPage({ searchParams }: { searchParams: Promise<{ product?: string; warehouse?: string }> }) {
  const user = await requirePermission("inventory.adjust");
  const sp = await searchParams;
  const canCost = can(user, "inventory.cost");
  const data = await docFormData(canCost);
  const wh = data.warehouses.find((w) => w.value === sp.warehouse) ?? data.warehouses.find((w) => w.isDefault) ?? data.warehouses[0];
  const product = data.products.find((p) => p.id === sp.product);
  return (
    <>
      <PageHeader title="New stock adjustment" description="Add or remove stock in one warehouse." backHref="/inventory/adjustments" />
      <AdjustmentForm
        data={data}
        canCost={canCost}
        initial={{
          date: today(),
          warehouseId: wh?.value ?? "",
          reason: "correction",
          notes: "",
          lines: product ? [{ productId: product.id, batchId: null, qtyChange: 0, unitCost: 0, notes: "" }] : [],
        }}
      />
    </>
  );
}
