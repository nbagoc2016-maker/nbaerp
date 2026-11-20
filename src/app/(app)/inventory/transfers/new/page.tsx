import { PageHeader } from "@/components/app/page-header";
import { TransferForm } from "@/components/inventory/stock-doc-forms";
import { today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { docFormData } from "@/server/queries/inventory";

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ product?: string; from?: string }> }) {
  const user = await requirePermission("inventory.transfer");
  const sp = await searchParams;
  const data = await docFormData(can(user, "inventory.cost"));
  const def = data.warehouses.find((w) => w.isDefault) ?? data.warehouses[0];
  const from = data.warehouses.find((w) => w.value === sp.from) ?? def;
  const to = data.warehouses.find((w) => w.value !== from?.value);
  const product = data.products.find((p) => p.id === sp.product);
  return (
    <>
      <PageHeader title="New stock transfer" description="Pick the source and destination, then the items to move." backHref="/inventory/transfers" />
      <TransferForm
        data={data}
        initial={{
          date: today(),
          fromWarehouseId: from?.value ?? "",
          toWarehouseId: to?.value ?? "",
          notes: "",
          lines: product ? [{ productId: product.id, batchId: null, qty: 1 }] : [],
        }}
      />
    </>
  );
}
