import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { CountSheet } from "@/components/inventory/count-sheet";
import { VoidDocButton } from "@/components/inventory/doc-buttons";
import { formatDate } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getCount } from "@/server/queries/inventory";

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.view");
  const { id } = await params;
  const c = await getCount(id);
  if (!c) notFound();
  const { doc } = c;
  const canAct = can(user, "inventory.adjust");
  const canCost = can(user, "inventory.cost");
  const editable = canAct && (doc.status === "counting" || doc.status === "draft");

  return (
    <>
      <PageHeader
        title={doc.number}
        description={[c.warehouse, formatDate(doc.date), c.createdBy ? `started by ${c.createdBy}` : null, c.journalNumber ? `journal ${c.journalNumber}` : null].filter(Boolean).join(" · ")}
        backHref="/inventory/counts"
        badge={<StatusBadge status={doc.status} />}
        actions={canAct && doc.status === "posted" ? <VoidDocButton kind="count" id={doc.id} number={doc.number} /> : undefined}
      />
      {doc.notes && <p className="mb-4 rounded-lg bg-muted/40 p-3 text-sm">{doc.notes}</p>}
      <CountSheet
        countId={doc.id}
        number={doc.number}
        editable={editable}
        canCost={canCost}
        lines={c.lines.map((l) => ({ ...l, unitCost: canCost ? l.unitCost : null }))}
      />
    </>
  );
}
