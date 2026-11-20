import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { docLinesValue } from "@/components/purchasing/doc-lines";
import { OrderForm } from "@/components/purchasing/order-form";
import { can, requirePermission } from "@/server/auth";
import { productOptions, supplierOptions, warehouseOptions } from "@/server/queries/options";
import { getPurchaseOrder } from "@/server/queries/purchasing";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("purchasing.create");
  const { id } = await params;
  const data = await getPurchaseOrder(id);
  if (!data) notFound();
  if (data.po.status !== "draft") redirect(`/purchasing/orders/${id}`);
  const [suppliers, warehouses, products] = await Promise.all([supplierOptions(), warehouseOptions(), productOptions({ mode: "purchase" })]);
  const { po } = data;

  return (
    <>
      <PageHeader title={`Edit ${po.number}`} description={data.supplier.name} backHref={`/purchasing/orders/${id}`} badge={<StatusBadge status={po.status} />} />
      <OrderForm
        suppliers={suppliers}
        warehouses={warehouses}
        products={products}
        canApprove={can(user, "purchasing.approve")}
        initial={{
          id: po.id,
          date: po.date,
          expectedDate: po.expectedDate ?? "",
          supplierId: po.supplierId,
          warehouseId: po.warehouseId,
          terms: po.terms ?? "",
          notes: po.notes ?? "",
          doc: docLinesValue(
            data.lines.map((l) => ({ productId: l.productId, description: l.description, qty: l.qty, price: l.unitCost, discountPct: l.discountPct, taxRate: l.taxRate })),
            { documentDiscount: po.documentDiscount, charges: po.freightCharges }
          ),
        }}
      />
    </>
  );
}
