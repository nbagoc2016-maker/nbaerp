import { PageHeader } from "@/components/app/page-header";
import { SupplierForm } from "@/components/purchasing/supplier-form";
import { requirePermission } from "@/server/auth";

export default async function NewSupplierPage() {
  await requirePermission("parties.manage");
  return (
    <>
      <PageHeader title="Add supplier" description="Set up a supplier with payment terms and any balance you owed them before go-live." backHref="/purchasing/suppliers" />
      <SupplierForm />
    </>
  );
}
