import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { AdjustmentForm } from "@/components/inventory/stock-doc-forms";
import { can, requirePermission } from "@/server/auth";
import { docFormData, getAdjustment } from "@/server/queries/inventory";

export default async function EditAdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.adjust");
  const { id } = await params;
  const canCost = can(user, "inventory.cost");
  const [a, data] = await Promise.all([getAdjustment(id), docFormData(canCost)]);
  if (!a) notFound();
  if (a.doc.status !== "draft") redirect(`/inventory/adjustments/${id}`);
  return (
    <>
      <PageHeader title={`Edit ${a.doc.number}`} description="Draft adjustment" backHref={`/inventory/adjustments/${id}`} />
      <AdjustmentForm
        data={data}
        canCost={canCost}
        initial={{
          id,
          date: a.doc.date,
          warehouseId: a.doc.warehouseId,
          reason: a.doc.reason,
          notes: a.doc.notes ?? "",
          lines: a.lines.map((l) => ({ productId: l.productId, batchId: l.batchId, qtyChange: l.qtyChange, unitCost: canCost ? l.unitCost : 0, notes: l.notes ?? "" })),
        }}
      />
    </>
  );
}
