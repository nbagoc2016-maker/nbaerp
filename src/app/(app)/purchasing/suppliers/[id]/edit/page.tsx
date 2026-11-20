import { notFound } from "next/navigation";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { SupplierForm } from "@/components/purchasing/supplier-form";
import { requirePermission } from "@/server/auth";
import { getSupplier, supplierOpeningDate } from "@/server/queries/suppliers";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("parties.manage");
  const { id } = await params;
  const s = await getSupplier(id);
  if (!s) notFound();
  const openingDate = await supplierOpeningDate(id);

  return (
    <>
      <PageHeader title={`Edit ${s.name}`} description={`Supplier ${s.code}`} backHref={`/purchasing/suppliers/${id}`} />
      <SupplierForm
        hasOpeningJournal={!!openingDate}
        initial={{
          id: s.id,
          code: s.code,
          name: s.name,
          contactPerson: s.contactPerson ?? "",
          phone: s.phone ?? "",
          altPhone: s.altPhone ?? "",
          email: s.email ?? "",
          address: s.address ?? "",
          city: s.city ?? "",
          taxNumber: s.taxNumber ?? "",
          cnic: s.cnic ?? "",
          paymentTermsDays: s.paymentTermsDays,
          creditLimit: s.creditLimit,
          openingBalance: s.openingBalance,
          openingDate: openingDate ?? today(),
          notes: s.notes ?? "",
          isActive: s.isActive,
        }}
      />
    </>
  );
}
