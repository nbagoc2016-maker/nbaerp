import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmployeeForm } from "@/components/hr/employee-form";
import { toEmployeeFormValues } from "@/components/hr/employee-values";
import { requirePermission } from "@/server/auth";
import { departmentsWithCounts, getEmployee } from "@/server/queries/hr";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("hr.manage");
  const { id } = await params;
  const [row, departments] = await Promise.all([getEmployee(id), departmentsWithCounts()]);
  if (!row) notFound();
  const e = row.employee;
  return (
    <>
      <PageHeader title={`Edit ${e.name}`} description={e.code} backHref={`/hr/employees/${e.id}`} badge={<StatusBadge status={e.status} />} />
      <EmployeeForm initial={toEmployeeFormValues(e)} departments={departments} />
    </>
  );
}
