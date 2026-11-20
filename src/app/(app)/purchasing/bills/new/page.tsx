import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { formatQty, today } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { BillForm, type BillFormValue, type BillLineMeta } from "@/components/purchasing/bill-form";
import { docLinesValue } from "@/components/purchasing/doc-lines";
import { can, requirePermission } from "@/server/auth";
import { billPrefillFromOrder, billPrefillFromReceipt } from "@/server/queries/purchasing";
import { billAccountOptions, purchaseFormLookups, unbilledReceiptOptions } from "@/server/queries/purchasing-forms";

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ grn?: string; po?: string; supplier?: string }> }) {
  const user = await requirePermission("purchasing.create");
  const sp = await searchParams;
  const [lookups, accounts, receipts, fromGrn, fromPo] = await Promise.all([
    purchaseFormLookups(),
    billAccountOptions(),
    unbilledReceiptOptions(),
    sp.grn ? billPrefillFromReceipt(sp.grn) : null,
    !sp.grn && sp.po ? billPrefillFromOrder(sp.po) : null,
  ]);
  if ((sp.grn && !fromGrn) || (sp.po && !sp.grn && !fromPo)) notFound();

  const meta: Record<string, BillLineMeta> = {};
  let initial: BillFormValue;
  let backHref = "/purchasing/bills";
  let description = "Enter the supplier's invoice.";

  if (fromGrn) {
    const { grn } = fromGrn;
    backHref = `/purchasing/receipts/${grn.id}`;
    description = `Billing goods received on ${grn.number} from ${fromGrn.supplier.name}.`;
    for (const l of fromGrn.lines) {
      meta[l.id] = { goodsReceiptLineId: l.id, linkedProductId: l.productId, sourceLabel: `from ${grn.number} · ${formatQty(l.qty)} unbilled at ${l.unitCost}` };
    }
    initial = {
      date: today(),
      dueDate: "",
      supplierId: grn.supplierId,
      supplierInvoiceNo: "",
      purchaseOrderId: grn.purchaseOrderId,
      goodsReceiptId: grn.id,
      sourceLabel: `Billing goods receipt ${grn.number}. Quantities default to what hasn't been billed yet.`,
      warehouseId: grn.warehouseId,
      receivesStock: false,
      notes: "",
      doc: docLinesValue(fromGrn.lines.map((l) => ({ key: l.id, productId: l.productId, description: l.description, qty: l.qty, price: l.unitCost, taxRate: l.taxRate }))),
      meta,
    };
  } else if (fromPo) {
    const { po } = fromPo;
    backHref = `/purchasing/orders/${po.id}`;
    description = `Billing purchase order ${po.number} from ${fromPo.supplier.name}.`;
    for (const l of fromPo.lines) meta[l.purchaseOrderLineId] = { purchaseOrderLineId: l.purchaseOrderLineId, linkedProductId: l.productId, sourceLabel: `from ${po.number}` };
    initial = {
      date: today(),
      dueDate: "",
      supplierId: po.supplierId,
      supplierInvoiceNo: "",
      purchaseOrderId: po.id,
      goodsReceiptId: null,
      sourceLabel: `Billing purchase order ${po.number} directly: stock lines are received into the warehouse when the bill posts.`,
      warehouseId: po.warehouseId,
      receivesStock: fromPo.lines.some((l) => l.productId),
      notes: "",
      doc: docLinesValue(
        fromPo.lines.map((l) => ({ key: l.purchaseOrderLineId, productId: l.productId, description: l.description, qty: l.qty, price: l.price, discountPct: l.discountPct, taxRate: l.taxRate })),
        { charges: po.freightCharges }
      ),
      meta,
    };
  } else {
    const supplier = lookups.suppliers.find((s) => s.value === sp.supplier);
    initial = {
      date: today(),
      dueDate: "",
      supplierId: supplier?.value ?? null,
      supplierInvoiceNo: "",
      purchaseOrderId: null,
      goodsReceiptId: null,
      warehouseId: null,
      receivesStock: false,
      notes: "",
      doc: docLinesValue([]),
      meta,
    };
  }

  return (
    <>
      <PageHeader title="New supplier bill" description={description} backHref={backHref} />
      {fromPo && fromPo.unbilledGrns.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <div>
            <p className="font-medium">Some goods on this order were already received</p>
            <p className="text-muted-foreground">
              Bill them from their receipt so Goods Received Not Invoiced is cleared:{" "}
              {fromPo.unbilledGrns.map((g, i) => (
                <span key={g.id}>
                  {i > 0 && ", "}
                  <Link href={`/purchasing/bills/new?grn=${g.id}`} className="font-medium text-primary hover:underline">
                    {g.number}
                  </Link>
                </span>
              ))}
              . Only what hasn&apos;t arrived yet is listed below.
            </p>
          </div>
        </div>
      )}
      <BillForm
        key={sp.grn ?? sp.po ?? "direct"}
        initial={initial}
        suppliers={lookups.suppliers}
        warehouses={lookups.warehouses}
        products={lookups.products}
        accounts={accounts}
        receipts={receipts}
        canPost={can(user, "purchasing.post")}
      />
    </>
  );
}
