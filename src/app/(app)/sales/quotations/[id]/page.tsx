import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { PrintDocument } from "@/components/app/print-document";
import { StatusBadge } from "@/components/app/status-badge";
import { PrintChrome } from "@/components/sales/common";
import { QuotationActions } from "@/components/sales/doc-actions";
import { formatDate } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { getCompany } from "@/server/queries/company";
import { effectiveQuotationStatus, getQuotation } from "@/server/queries/sales";
import { displayLine } from "@/server/services/sales";

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sales.view");
  const { id } = await params;
  const data = await getQuotation(id);
  if (!data) notFound();
  const company = await getCompany();
  const { quotation: q, lines, customer, orders } = data;
  const shown = effectiveQuotationStatus(q.status, q.validUntil);

  return (
    <>
      <PrintChrome />
      <PageHeader
        title={q.number}
        description={`Quotation for ${q.customerName} · ${formatDate(q.date)}`}
        backHref="/sales/quotations"
        badge={<StatusBadge status={shown} />}
        actions={<QuotationActions id={q.id} number={q.number} status={q.status} hasCustomer={!!q.customerId} canCreate={can(user, "sales.create")} />}
      />
      {orders.length > 0 && (
        <p className="no-print mb-4 text-sm text-muted-foreground">
          Converted to{" "}
          {orders.map((o) => (
            <Link key={o.id} href={`/sales/orders/${o.id}`} className="font-medium text-primary hover:underline">
              {o.number}
            </Link>
          ))}
        </p>
      )}
      <PrintDocument showCompanyFooter
        company={company}
        title="Quotation"
        number={q.number}
        date={q.date}
        meta={q.validUntil ? [{ label: "Valid until", value: formatDate(q.validUntil) }] : []}
        party={{
          label: "Prepared for",
          name: q.customerName,
          lines: customer ? [[customer.address, customer.city].filter(Boolean).join(", "), customer.phone] : [],
        }}
        lines={lines.map((l) => {
          const d = displayLine(l);
          return { description: l.description, sku: l.sku, qty: l.qty, unit: l.unit, price: l.unitPrice, discountAmount: d.discountAmount, taxAmount: d.taxAmount, lineTotal: d.lineTotal };
        })}
        totals={[
          { label: "Subtotal", value: q.subtotal },
          ...(q.discountTotal ? [{ label: "Discount", value: -q.discountTotal }] : []),
          ...(q.taxTotal ? [{ label: "Sales tax", value: q.taxTotal }] : []),
          ...(q.shippingCharges ? [{ label: "Delivery charges", value: q.shippingCharges }] : []),
          { label: "Total", value: q.total, strong: true },
        ]}
        notes={[q.terms ? `Terms: ${q.terms}` : null, q.notes].filter(Boolean).join("\n\n") || null}
      />
    </>
  );
}
