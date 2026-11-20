import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { docLinesValue } from "@/components/purchasing/doc-lines";
import { OrderForm } from "@/components/purchasing/order-form";
import { can, requirePermission } from "@/server/auth";
import { defaultWarehouseId, productOptions, supplierOptions, warehouseOptions } from "@/server/queries/options";

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  const user = await requirePermission("purchasing.create");
  const sp = await searchParams;
  const [suppliers, warehouses, products, warehouseId] = await Promise.all([
    supplierOptions(),
    warehouseOptions(),
    productOptions({ mode: "purchase" }),
    defaultWarehouseId(),
  ]);
  const supplier = suppliers.find((s) => s.value === sp.supplier);

  return (
    <>
      <PageHeader title="New purchase order" description="List what you want from the supplier. Save as a draft, or approve it straight away." backHref="/purchasing/orders" />
      <OrderForm
        suppliers={suppliers}
        warehouses={warehouses}
        products={products}
        canApprove={can(user, "purchasing.approve")}
        initial={{
          date: today(),
          expectedDate: addDays(today(), 7),
          supplierId: supplier?.value ?? null,
          warehouseId,
          terms: supplier ? (supplier.paymentTermsDays ? `Payment within ${supplier.paymentTermsDays} days of invoice` : "Payment on delivery") : "",
          notes: "",
          doc: docLinesValue([]),
        }}
      />
    </>
  );
}
