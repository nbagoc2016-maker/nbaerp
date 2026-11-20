import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { LeaveForm } from "@/components/hr/leave-form";
import { Button } from "@/components/ui/button";
import { today } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { leaveBalanceTable, listLeaveTypes } from "@/server/queries/hr";
import { employeeOptions } from "@/server/queries/options";

export default async function NewLeavePage({ searchParams }: { searchParams: Promise<{ employeeId?: string }> }) {
  await requirePermission(["hr.attendance", "hr.manage"]);
  const { employeeId } = await searchParams;
  const [employees, leaveTypes, balances] = await Promise.all([employeeOptions(), listLeaveTypes(), leaveBalanceTable(Number(today().slice(0, 4)))]);
  const taken: Record<string, number> = {};
  for (const r of balances.rows) for (const b of r.balances) taken[`${r.id}:${b.typeId}`] = b.taken;

  return (
    <>
      <PageHeader title="New leave request" description="Days are counted automatically, skipping Sundays." backHref="/hr/leave" />
      {leaveTypes.length ? (
        <LeaveForm employees={employees} leaveTypes={leaveTypes} taken={taken} defaultEmployeeId={employeeId} />
      ) : (
        <EmptyState
          title="Set up leave types first"
          description="Add leave types such as Annual, Sick or Unpaid leave from the Employees page (Departments & leave types)."
          action={
            <Button asChild size="sm">
              <Link href="/hr/employees">Go to employees</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
