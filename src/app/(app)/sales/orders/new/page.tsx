import { PageHeader } from "@/components/app/page-header";
import { blankDocLines } from "@/components/sales/doc-lines";
import { SalesDocForm } from "@/components/sales/sales-doc-form";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { salesFormData } from "@/server/queries/sales";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await requirePermission("sales.create");
  const sp = await searchParams;
  const data = await salesFormData();
  const customer = data.customers.find((c) => c.value === sp.customer) ?? null;
  return (
    <>
      <PageHeader title="New sales order" description="Book an order now; stock moves only when you invoice it." backHref="/sales/orders" />
      <SalesDocForm
        kind="order"
        canPost={false}
        products={data.products}
        priceMap={data.priceMap}
        stockMap={data.stockMap}
        customers={data.customers}
        warehouses={data.warehouses}
        credit={data.credit}
        initial={{
          date: today(),
          secondaryDate: "",
          customerId: customer?.value ?? null,
          customerName: "",
          customerPhone: "",
          warehouseId: data.defaultWarehouseId,
          salesperson: "",
          terms: "",
          notes: "",
          lines: blankDocLines(),
        }}
      />
    </>
  );
}
