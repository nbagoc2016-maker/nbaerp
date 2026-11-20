import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { CustomerForm } from "@/components/sales/customer-form";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { getCustomer } from "@/server/queries/customers";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("parties.manage");
  const { id } = await params;
  const c = await getCustomer(id);
  if (!c) notFound();
  return (
    <>
      <PageHeader title={`Edit ${c.name}`} description={`Customer ${c.code}`} backHref={`/sales/customers/${c.id}`} />
      <CustomerForm
        openingLocked={c.openingPosted}
        initial={{
          id: c.id,
          name: c.name,
          type: c.type,
          priceLevel: c.priceLevel,
          contactPerson: c.contactPerson ?? "",
          phone: c.phone ?? "",
          altPhone: c.altPhone ?? "",
          email: c.email ?? "",
          address: c.address ?? "",
          city: c.city ?? "",
          taxNumber: c.taxNumber ?? "",
          cnic: c.cnic ?? "",
          paymentTermsDays: c.paymentTermsDays,
          creditLimit: c.creditLimit,
          openingBalance: c.openingBalance,
          openingDate: today(),
          notes: c.notes ?? "",
          isActive: c.isActive,
        }}
      />
    </>
  );
}
