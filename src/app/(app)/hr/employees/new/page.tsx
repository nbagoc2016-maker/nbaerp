import { PageHeader } from "@/components/app/page-header";
import { EmployeeForm } from "@/components/hr/employee-form";
import { requirePermission } from "@/server/auth";
import { departmentsWithCounts } from "@/server/queries/hr";

export default async function NewEmployeePage() {
  await requirePermission("hr.manage");
  const departments = await departmentsWithCounts();
  return (
    <>
      <PageHeader title="Add employee" description="Personal details, job and monthly pay. You can change any of this later." backHref="/hr/employees" />
      <EmployeeForm departments={departments} />
    </>
  );
}
