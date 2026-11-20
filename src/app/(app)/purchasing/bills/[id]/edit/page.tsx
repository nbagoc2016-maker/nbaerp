import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { BillForm, type BillLineMeta } from "@/components/purchasing/bill-form";
import { docLinesValue } from "@/components/purchasing/doc-lines";
import { can, requirePermission } from "@/server/auth";
import { getBill } from "@/server/queries/purchasing";
import { billAccountOptions, purchaseFormLookups, unbilledReceiptOptions } from "@/server/queries/purchasing-forms";

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("purchasing.create");
  const { id } = await params;
  const data = await getBill(id);
  if (!data) notFound();
  if (data.bill.status !== "draft") redirect(`/purchasing/bills/${id}`);
  const [lookups, accounts, receipts] = await Promise.all([purchaseFormLookups(), billAccountOptions(), unbilledReceiptOptions()]);
  const { bill } = data;

  const meta: Record<string, BillLineMeta> = {};
  for (const l of data.lines) {
    const linked = l.goodsReceiptLineId || l.purchaseOrderLineId;
    meta[l.id] = {
      goodsReceiptLineId: l.goodsReceiptLineId,
      purchaseOrderLineId: l.purchaseOrderLineId,
      expenseAccountId: l.expenseAccountId,
      batchNo: l.batchNo,
      linkedProductId: linked ? l.productId : undefined,
      sourceLabel: l.grnNumber ? `from ${l.grnNumber}` : l.purchaseOrderLineId && data.poNumber ? `from ${data.poNumber}` : null,
    };
  }

  return (
    <>
      <PageHeader title={`Edit ${bill.number}`} description={data.supplier.name} backHref={`/purchasing/bills/${id}`} badge={<StatusBadge status={bill.status} />} />
      <BillForm
        suppliers={lookups.suppliers}
        warehouses={lookups.warehouses}
        products={lookups.products}
        accounts={accounts}
        receipts={receipts}
        canPost={can(user, "purchasing.post")}
        initial={{
          id: bill.id,
          date: bill.date,
          dueDate: bill.dueDate ?? "",
          supplierId: bill.supplierId,
          supplierInvoiceNo: bill.supplierInvoiceNo ?? "",
          purchaseOrderId: bill.purchaseOrderId,
          goodsReceiptId: bill.goodsReceiptId,
          sourceLabel: data.grnNumber ? `Billing goods receipt ${data.grnNumber}.` : data.poNumber ? `Billing purchase order ${data.poNumber}.` : null,
          warehouseId: bill.warehouseId,
          receivesStock: bill.receivesStock,
          notes: bill.notes ?? "",
          doc: docLinesValue(
            data.lines.map((l) => ({ key: l.id, productId: l.productId, description: l.description, qty: l.qty, price: l.unitCost, discountPct: l.discountPct, taxRate: l.taxRate })),
            { documentDiscount: bill.documentDiscount, charges: bill.freightCharges }
          ),
          meta,
        }}
      />
    </>
  );
}
