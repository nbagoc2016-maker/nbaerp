import { notFound } from "next/navigation";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { ReceiptForm } from "@/components/purchasing/receipt-form";
import { can, requirePermission } from "@/server/auth";
import { defaultWarehouseId } from "@/server/queries/options";
import { receiptPrefillFromOrder } from "@/server/queries/purchasing";
import { purchaseFormLookups, receivableOrderOptions } from "@/server/queries/purchasing-forms";

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  const user = await requirePermission("purchasing.create");
  const sp = await searchParams;
  const [lookups, orders, warehouseId, prefill] = await Promise.all([
    purchaseFormLookups(),
    receivableOrderOptions(),
    defaultWarehouseId(),
    sp.po ? receiptPrefillFromOrder(sp.po) : null,
  ]);
  if (sp.po && !prefill) notFound();
  const po = prefill?.po;

  return (
    <>
      <PageHeader
        title="Receive goods"
        description={po ? `Goods arriving against ${po.number} from ${prefill.supplier.name}. Quantities default to what is still to come.` : "Record a delivery into a warehouse."}
        backHref={po ? `/purchasing/orders/${po.id}` : "/purchasing/receipts"}
      />
      <ReceiptForm
        key={po?.id ?? "direct"}
        suppliers={lookups.suppliers}
        warehouses={lookups.warehouses}
        products={lookups.products}
        orders={po && !orders.some((o) => o.value === po.id) ? [...orders, { value: po.id, label: po.number }] : orders}
        canPost={can(user, "purchasing.post")}
        initial={{
          date: today(),
          supplierId: po?.supplierId ?? null,
          warehouseId: po?.warehouseId ?? warehouseId,
          purchaseOrderId: po?.id ?? null,
          poNumber: po?.number ?? null,
          supplierDeliveryRef: "",
          notes: "",
          lines: prefill?.lines.length
            ? prefill.lines.map((l) => ({
                key: l.purchaseOrderLineId,
                purchaseOrderLineId: l.purchaseOrderLineId,
                productId: l.productId,
                description: l.description,
                qty: l.qty,
                unitCost: l.unitCost,
                ordered: l.ordered,
                received: l.received,
                rolls: [],
              }))
            : [{ key: "new-1", purchaseOrderLineId: null, productId: null, description: "", qty: 1, unitCost: 0, rolls: [] }],
        }}
      />
    </>
  );
}
