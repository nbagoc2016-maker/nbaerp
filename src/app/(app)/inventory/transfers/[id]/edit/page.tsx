import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { TransferForm } from "@/components/inventory/stock-doc-forms";
import { can, requirePermission } from "@/server/auth";
import { docFormData, getTransfer } from "@/server/queries/inventory";

export default async function EditTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.transfer");
  const { id } = await params;
  const [t, data] = await Promise.all([getTransfer(id), docFormData(can(user, "inventory.cost"))]);
  if (!t) notFound();
  if (t.doc.status !== "draft") redirect(`/inventory/transfers/${id}`);
  return (
    <>
      <PageHeader title={`Edit ${t.doc.number}`} description="Draft transfer" backHref={`/inventory/transfers/${id}`} />
      <TransferForm
        data={data}
        initial={{
          id,
          date: t.doc.date,
          fromWarehouseId: t.doc.fromWarehouseId,
          toWarehouseId: t.doc.toWarehouseId,
          notes: t.doc.notes ?? "",
          lines: t.lines.map((l) => ({ productId: l.productId, batchId: l.batchId, qty: l.qty })),
        }}
      />
    </>
  );
}
