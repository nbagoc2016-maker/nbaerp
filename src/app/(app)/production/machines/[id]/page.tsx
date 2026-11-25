import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { MachineTypeForm } from "@/components/production/machine-type-form";
import { requirePermission } from "@/server/auth";
import { getMachineType } from "@/server/queries/production";

export default async function EditMachineTypePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("production.manage");
  const { id } = await params;
  const m = await getMachineType(id);
  if (!m) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${m.code}`}
        description={m.name}
        backHref="/production/machines"
      />
      <MachineTypeForm
        initial={{
          id: m.id,
          code: m.code,
          name: m.name,
          description: m.description,
          capacity: m.capacity,
          isActive: m.isActive,
        }}
      />
    </>
  );
}
