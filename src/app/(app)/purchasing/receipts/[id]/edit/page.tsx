import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ReceiptForm } from "@/components/purchasing/receipt-form";
import { can, requirePermission } from "@/server/auth";
import { getPurchaseOrder, getReceipt, groupReceiptLines } from "@/server/queries/purchasing";
import { purchaseFormLookups } from "@/server/queries/purchasing-forms";

export default async function EditReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("purchasing.create");
  const { id } = await params;
  const data = await getReceipt(id);
  if (!data) notFound();
  if (data.grn.status !== "draft") redirect(`/purchasing/receipts/${id}`);
  const [lookups, po] = await Promise.all([purchaseFormLookups(), data.grn.purchaseOrderId ? getPurchaseOrder(data.grn.purchaseOrderId) : null]);
  const { grn } = data;
  const poLines = new Map((po?.lines ?? []).map((l) => [l.id, l]));

  return (
    <>
      <PageHeader title={`Edit ${grn.number}`} description={data.supplier.name} backHref={`/purchasing/receipts/${id}`} badge={<StatusBadge status={grn.status} />} />
      <ReceiptForm
        suppliers={lookups.suppliers}
        warehouses={lookups.warehouses}
        products={lookups.products}
        orders={[]}
        canPost={can(user, "purchasing.post")}
        initial={{
          id: grn.id,
          date: grn.date,
          supplierId: grn.supplierId,
          warehouseId: grn.warehouseId,
          purchaseOrderId: grn.purchaseOrderId,
          poNumber: data.poNumber,
          supplierDeliveryRef: grn.supplierDeliveryRef ?? "",
          notes: grn.notes ?? "",
          lines: groupReceiptLines(data.lines).map((g) => {
            const pl = g.first.purchaseOrderLineId ? poLines.get(g.first.purchaseOrderLineId) : undefined;
            return {
              key: g.first.id,
              purchaseOrderLineId: g.first.purchaseOrderLineId,
              productId: g.first.productId,
              description: g.first.description,
              qty: g.qty,
              unitCost: g.first.unitCost,
              ordered: pl?.qty,
              received: pl?.receivedQty,
              rolls: g.rolls.map((r, i) => ({ key: `${g.first.id}-${i}`, batchNo: r.batchNo ?? "", qty: r.qty })),
            };
          }),
        }}
      />
    </>
  );
}
