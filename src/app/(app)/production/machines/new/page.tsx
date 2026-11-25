import { PageHeader } from "@/components/app/page-header";
import { MachineTypeForm } from "@/components/production/machine-type-form";
import { requirePermission } from "@/server/auth";

export default async function NewMachineTypePage() {
  await requirePermission("production.manage");

  return (
    <>
      <PageHeader
        title="New Machine Type"
        description="Add a machine or equipment type that can be assigned to work orders."
        backHref="/production/machines"
      />
      <MachineTypeForm />
    </>
  );
}
