import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { toDocLines } from "@/components/sales/doc-lines";
import { SalesDocForm } from "@/components/sales/sales-doc-form";
import { requirePermission } from "@/server/auth";
import { getQuotation, salesFormData } from "@/server/queries/sales";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("sales.create");
  const { id } = await params;
  const found = await getQuotation(id);
  if (!found) notFound();
  const { quotation: q, lines } = found;
  if (q.status !== "draft" && q.status !== "sent") redirect(`/sales/quotations/${id}`);
  const data = await salesFormData();
  return (
    <>
      <PageHeader title={`Edit ${q.number}`} description="Update the offer before the customer accepts it." backHref={`/sales/quotations/${id}`} badge={<StatusBadge status={q.status} />} />
      <SalesDocForm
        kind="quotation"
        canPost={false}
        products={data.products}
        priceMap={data.priceMap}
        stockMap={data.stockMap}
        customers={data.customers}
        warehouses={data.warehouses}
        credit={data.credit}
        initial={{
          id: q.id,
          number: q.number,
          date: q.date,
          secondaryDate: q.validUntil ?? "",
          customerId: q.customerId,
          customerName: q.customerId ? "" : q.customerName,
          customerPhone: "",
          warehouseId: null,
          salesperson: "",
          terms: q.terms ?? "",
          notes: q.notes ?? "",
          lines: toDocLines(lines, q.documentDiscount, q.shippingCharges),
        }}
      />
    </>
  );
}
