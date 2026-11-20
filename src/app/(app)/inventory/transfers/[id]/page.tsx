import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { DeleteDraftButton, PostDocButton, VoidDocButton } from "@/components/inventory/doc-buttons";
import { Button } from "@/components/ui/button";
import { formatMoney, formatQty } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getTransfer } from "@/server/queries/inventory";

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory.view");
  const { id } = await params;
  const [t, company] = await Promise.all([getTransfer(id), getCompany()]);
  if (!t) notFound();
  const { doc } = t;
  const canAct = can(user, "inventory.transfer");
  const totalQty = t.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      <PageHeader
        className="no-print"
        title={doc.number}
        description={`${t.from} → ${t.to}`}
        backHref="/inventory/transfers"
        badge={<StatusBadge status={doc.status} />}
        actions={
          <>
            <PrintButton label="Print transfer note" />
            {canAct && doc.status === "draft" && (
              <>
                <DeleteDraftButton kind="transfer" id={doc.id} number={doc.number} />
                <Button asChild variant="outline" size="sm">
                  <Link href={`/inventory/transfers/${doc.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
                <PostDocButton kind="transfer" id={doc.id} number={doc.number} />
              </>
            )}
            {canAct && doc.status === "posted" && <VoidDocButton kind="transfer" id={doc.id} number={doc.number} />}
          </>
        }
      />
      {doc.status === "posted" && can(user, "inventory.cost") && (
        <p className="no-print mb-4 text-sm text-muted-foreground">
          Goods moved at a cost of <span className="font-medium text-foreground tabular">{formatMoney(t.value)}</span>. No journal entry: the value stays in Inventory.
        </p>
      )}
      <PrintDocument
        company={company}
        title="Stock Transfer"
        number={doc.number}
        date={doc.date}
        meta={[
          { label: "Status", value: doc.status === "posted" ? "Posted" : doc.status === "void" ? "Void" : "Draft" },
          ...(t.createdBy ? [{ label: "Prepared by", value: t.createdBy }] : []),
        ]}
        party={{ label: "From → To", name: `${t.from} (${t.fromCode}) → ${t.to} (${t.toCode})` }}
        notes={doc.notes}
        footer={
          <>
            <table className="mt-5 w-full">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2">Roll / batch</th>
                  <th className="py-2 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {t.lines.map((l, i) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 align-top text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-2 align-top">
                      <Link href={`/inventory/products/${l.productId}`} className="hover:underline print:no-underline">
                        {l.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{l.sku}</span>
                    </td>
                    <td className="py-2 pr-2 align-top">
                      {l.batchNo ?? "—"}
                      {l.shade && <span className="block text-xs text-muted-foreground">Shade {l.shade}</span>}
                    </td>
                    <td className="py-2 text-right align-top font-medium tabular">
                      {formatQty(l.qty)} {l.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td colSpan={3} className="py-2">
                    Total ({t.lines.length} item{t.lines.length === 1 ? "" : "s"})
                  </td>
                  <td className="py-2 text-right tabular">{formatQty(totalQty)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="mt-14 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground">
              {["Dispatched by", "Carried by", "Received by"].map((s) => (
                <div key={s} className="border-t pt-2">
                  {s}
                </div>
              ))}
            </div>
          </>
        }
      />
    </>
  );
}
