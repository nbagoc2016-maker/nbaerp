import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { PrintChrome } from "@/components/sales/common";
import { ReturnActions } from "@/components/sales/doc-actions";
import { formatDate } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { getReturn } from "@/server/queries/sales";

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sales.view");
  const { id } = await params;
  const data = await getReturn(id);
  if (!data) notFound();
  const company = await getCompany();
  const { ret: r, lines, invoice, refundAccount, warehouse } = data;

  return (
    <>
      <PrintChrome />
      <PageHeader
        title={r.number}
        description={`Return from ${r.customerName} · ${formatDate(r.date)}`}
        backHref="/sales/returns"
        badge={<StatusBadge status={r.status} />}
        actions={<ReturnActions id={r.id} number={r.number} status={r.status} perms={{ post: can(user, "sales.post"), void: can(user, "sales.void") }} />}
      />
      {invoice && (
        <p className="no-print mb-4 text-sm text-muted-foreground">
          Against invoice{" "}
          <Link href={`/sales/invoices/${invoice.id}`} className="font-medium text-primary hover:underline">
            {invoice.number}
          </Link>{" "}
          · stock back into {warehouse?.name}
        </p>
      )}
      <PrintDocument showCompanyFooter
        company={company}
        title={r.settlement === "refund" ? "Refund Note" : "Credit Note"}
        number={r.number}
        date={r.date}
        meta={[
          ...(invoice ? [{ label: "Invoice", value: invoice.number }] : []),
          { label: "Settlement", value: r.settlement === "refund" ? `Refund from ${refundAccount?.name ?? "cash/bank"}` : "Credited to account" },
        ]}
        party={{ label: "Customer", name: r.customerName }}
        lines={lines.map((l) => ({
          description: l.description,
          sku: l.sku,
          qty: l.qty,
          unit: l.unit,
          price: l.unitPrice,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        }))}
        totals={[
          { label: "Subtotal", value: r.subtotal },
          ...(r.discountTotal ? [{ label: "Discount", value: -r.discountTotal }] : []),
          ...(r.taxTotal ? [{ label: "Sales tax", value: r.taxTotal }] : []),
          { label: r.settlement === "refund" ? "Refunded" : "Credited", value: r.total, strong: true },
        ]}
        notes={r.reason ? `Reason: ${r.reason}` : null}
        footer={
          r.status === "void" ? (
            <p className="mt-6 text-center text-2xl font-bold uppercase tracking-[0.3em] text-destructive/70">Void</p>
          ) : r.status === "draft" ? (
            <p className="mt-6 text-center text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">Draft — not posted</p>
          ) : null
        }
      />
    </>
  );
}
