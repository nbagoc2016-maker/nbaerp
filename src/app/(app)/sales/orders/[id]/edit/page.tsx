import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { toDocLines } from "@/components/sales/doc-lines";
import { SalesDocForm } from "@/components/sales/sales-doc-form";
import { requirePermission } from "@/server/auth";
import { getOrder, salesFormData } from "@/server/queries/sales";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("sales.create");
  const { id } = await params;
  const found = await getOrder(id);
  if (!found) notFound();
  const { order: o, lines } = found;
  if (o.status !== "draft") redirect(`/sales/orders/${id}`);
  const data = await salesFormData();
  return (
    <>
      <PageHeader title={`Edit ${o.number}`} description="Only draft orders can be changed." backHref={`/sales/orders/${id}`} badge={<StatusBadge status="draft" />} />
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
          id: o.id,
          number: o.number,
          date: o.date,
          secondaryDate: o.deliveryDate ?? "",
          customerId: o.customerId,
          customerName: "",
          customerPhone: "",
          warehouseId: o.warehouseId,
          salesperson: "",
          terms: "",
          notes: o.notes ?? "",
          quotationId: o.quotationId,
          lines: toDocLines(lines, o.documentDiscount, o.shippingCharges),
        }}
      />
    </>
  );
}
