import { PageHeader } from "@/components/app/page-header";
import { blankDocLines } from "@/components/sales/doc-lines";
import { SalesDocForm } from "@/components/sales/sales-doc-form";
import { addDays, today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { salesFormData } from "@/server/queries/sales";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const user = await requirePermission("sales.create");
  const sp = await searchParams;
  const data = await salesFormData();
  const customer = data.customers.find((c) => c.value === sp.customer) ?? null;
  const date = today();
  return (
    <>
      <PageHeader title="New invoice" description="Bill a customer. Posting takes the stock out and records the sale in the books." backHref="/sales/invoices" />
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
          date,
          secondaryDate: addDays(date, customer?.paymentTermsDays ?? 0),
          customerId: customer?.value ?? null,
          customerName: "",
          customerPhone: customer?.phone ?? "",
          warehouseId: data.defaultWarehouseId,
          salesperson: user.name,
          terms: "",
          notes: "",
          lines: blankDocLines(),
        }}
      />
    </>
  );
}
