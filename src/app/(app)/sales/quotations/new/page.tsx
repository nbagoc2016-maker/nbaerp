import { PageHeader } from "@/components/app/page-header";
import { blankDocLines } from "@/components/sales/doc-lines";
import { SalesDocForm } from "@/components/sales/sales-doc-form";
import { addDays, today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { salesFormData } from "@/server/queries/sales";

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await requirePermission("sales.create");
  const sp = await searchParams;
  const data = await salesFormData();
  const customer = data.customers.find((c) => c.value === sp.customer) ?? null;
  const date = today();
  return (
    <>
      <PageHeader title="New quotation" description="Nothing is posted; stock and the books are untouched until it becomes an invoice." backHref="/sales/quotations" />
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
          date,
          secondaryDate: addDays(date, 15),
          customerId: customer?.value ?? null,
          customerName: "",
          customerPhone: "",
          warehouseId: null,
          salesperson: "",
          terms: "",
          notes: "",
          lines: blankDocLines(),
        }}
      />
    </>
  );
}
