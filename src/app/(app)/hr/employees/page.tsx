import Link from "next/link";
import { CalendarCheck, HandCoins, UserPlus, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmployeesTable } from "@/components/hr/employees-table";
import { HrSetupSheet } from "@/components/hr/hr-setup-sheet";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import { departmentsWithCounts, employeeKpis, listEmployees, listLeaveTypes } from "@/server/queries/hr";

export default async function EmployeesPage() {
  const user = await requirePermission("hr.view");
  const [rows, kpis, departments, leaveTypes] = await Promise.all([listEmployees(), employeeKpis(), departmentsWithCounts(), listLeaveTypes()]);
  const canManage = can(user, "hr.manage");

  return (
    <>
      <PageHeader
        title="Employees"
        description="Your staff, their pay and what they owe — the starting point for attendance, leave and payroll."
        actions={
          canManage && (
            <>
              <HrSetupSheet departments={departments} leaveTypes={leaveTypes} />
              <Button asChild size="sm">
                <Link href="/hr/employees/new">
                  <UserPlus className="size-4" />
                  Add employee
                </Link>
              </Button>
            </>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Headcount" value={kpis.headcount} icon={Users} hint="Active and on leave" />
        <StatCard label="Monthly payroll cost" value={formatMoney(kpis.monthlyCost)} icon={Wallet} tone="info" hint="Basic + allowances" />
        <StatCard
          label="Present today"
          value={`${kpis.presentToday} / ${kpis.headcount}`}
          icon={CalendarCheck}
          tone="success"
          hint={
            kpis.markedToday ? (
              "Includes late and half day"
            ) : (
              <Link href="/hr/attendance" className="text-primary hover:underline">
                Attendance not marked yet
              </Link>
            )
          }
        />
        <StatCard
          label="Open advances"
          value={formatMoney(kpis.openAdvanceTotal)}
          icon={HandCoins}
          tone="warning"
          hint={`${kpis.openAdvances} advance${kpis.openAdvances === 1 ? "" : "s"} / loan${kpis.openAdvances === 1 ? "" : "s"} being recovered`}
        />
      </div>
      <EmployeesTable data={rows} departments={departments} canManage={canManage} />
    </>
  );
}
