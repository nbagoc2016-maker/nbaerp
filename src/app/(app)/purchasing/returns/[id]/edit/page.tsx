import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ReturnForm } from "@/components/purchasing/return-form";
import { can, requirePermission } from "@/server/auth";
import { getReturn, returnPrefillFromBill } from "@/server/queries/purchasing";

export default async function EditReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("purchasing.create");
  const { id } = await params;
  const data = await getReturn(id);
  if (!data) notFound();
  if (data.ret.status !== "draft" || !data.ret.billId) redirect(`/purchasing/returns/${id}`);
  const prefill = await returnPrefillFromBill(data.ret.billId, id);
  if (!prefill) redirect(`/purchasing/returns/${id}`);
  const { ret } = data;

  return (
    <>
      <PageHeader title={`Edit ${ret.number}`} description={data.supplier.name} backHref={`/purchasing/returns/${id}`} badge={<StatusBadge status={ret.status} />} />
      <ReturnForm
        bills={[]}
        lines={prefill.lines}
        canPost={can(user, "purchasing.post")}
        initial={{
          id: ret.id,
          billId: ret.billId,
          billLabel: `${data.billNumber ?? ""} · ${data.supplier.name}`,
          date: ret.date,
          reason: ret.reason ?? "",
          qty: Object.fromEntries(data.lines.filter((l) => l.billLineId).map((l) => [l.billLineId!, l.qty])),
          batch: Object.fromEntries(data.lines.filter((l) => l.billLineId).map((l) => [l.billLineId!, l.batchId])),
        }}
      />
    </>
  );
}
