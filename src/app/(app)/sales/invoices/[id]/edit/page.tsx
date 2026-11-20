import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { toDocLines } from "@/components/sales/doc-lines";
import { SalesDocForm } from "@/components/sales/sales-doc-form";
import { can, requirePermission } from "@/server/auth";
import { getInvoice, salesFormData } from "@/server/queries/sales";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sales.create");
  const { id } = await params;
  const found = await getInvoice(id);
  if (!found) notFound();
  const { invoice: inv, lines } = found;
  if (inv.status !== "draft") redirect(`/sales/invoices/${id}`);
  const data = await salesFormData();
  return (
    <>
      <PageHeader title={`Edit ${inv.number}`} description="Only drafts can be changed. Post it when it's ready." backHref={`/sales/invoices/${id}`} badge={<StatusBadge status="draft" />} />
      <SalesDocForm
        kind="invoice"
        canPost={can(user, "sales.post")}
        products={data.products}
        priceMap={data.priceMap}
        stockMap={data.stockMap}
        customers={data.customers}
        warehouses={data.warehouses}
        credit={data.credit}
        initial={{
          id: inv.id,
          number: inv.number,
          date: inv.date,
          secondaryDate: inv.dueDate ?? inv.date,
          customerId: inv.customerId,
          customerName: inv.customerId ? "" : inv.customerName,
          customerPhone: inv.customerPhone ?? "",
          warehouseId: inv.warehouseId,
          salesperson: inv.salesperson ?? "",
          terms: "",
          notes: inv.notes ?? "",
          salesOrderId: inv.salesOrderId,
          lines: toDocLines(lines, inv.documentDiscount, inv.shippingCharges),
        }}
      />
    </>
  );
}
