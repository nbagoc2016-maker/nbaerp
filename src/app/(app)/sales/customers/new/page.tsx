import { PageHeader } from "@/components/app/page-header";
import { CustomerForm } from "@/components/sales/customer-form";
import { requirePermission } from "@/server/auth";

export default async function NewCustomerPage() {
  await requirePermission("parties.manage");
  return (
    <>
      <PageHeader title="New customer" description="Add someone you sell to. An opening balance is posted to the books once." backHref="/sales/customers" />
      <CustomerForm />
    </>
  );
}
