import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, HandCoins, Pencil, Plane, Wallet } from "lucide-react";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { AdvancesTable } from "@/components/hr/advances-table";
import { AttendanceStrip } from "@/components/hr/attendance-strip";
import { ATTENDANCE_META, STATUS_ORDER, attendanceTotals } from "@/components/hr/attendance-style";
import { EmployeeAvatar } from "@/components/hr/employee-avatar";
import { EmployeeLedgerTable } from "@/components/hr/employee-ledger-table";
import { EmployeePayslipsTable } from "@/components/hr/employee-payslips-table";
import { LeaveBalancesTable } from "@/components/hr/leave-balances";
import { LeaveTable } from "@/components/hr/leave-table";
import { MonthPicker } from "@/components/hr/url-pickers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, formatQty, monthLabel, today } from "@/lib/format";
import { can, requirePermission } from "@/server/auth";
import {
  employeeAdvancesList,
  employeeAttendance,
  employeeLedger,
  employeePayslips,
  getEmployee,
  leaveBalanceTable,
  listLeaveRequests,
} from "@/server/queries/hr";
import { ACC } from "@/server/services/chart-of-accounts";
import { periodEnd, periodStart, workingDaysBetween } from "@/server/services/hr-dates";

const TABS = ["profile", "attendance", "leave", "advances", "payslips", "ledger"] as const;

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const user = await requirePermission("hr.view");
  const { id } = await params;
  const sp = await searchParams;
  const row = await getEmployee(id);
  if (!row) notFound();
  const e = row.employee;
  const canPayroll = can(user, "hr.payroll");
  const canManage = can(user, "hr.manage");
  const canAttendance = can(user, "hr.attendance");
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today().slice(0, 7);
  const year = Number(month.slice(0, 4));
  const tabs = TABS.filter((t) => canPayroll || !["advances", "payslips", "ledger"].includes(t));
  const tab = tabs.find((t) => t === sp.tab) ?? "profile";

  const [att, leaves, balances, advances, slips, ledger] = await Promise.all([
    employeeAttendance(id, month),
    listLeaveRequests({ employeeId: id }),
    leaveBalanceTable(year, id),
    canPayroll ? employeeAdvancesList(id) : Promise.resolve([]),
    canPayroll ? employeePayslips(id) : Promise.resolve([]),
    canPayroll ? employeeLedger(id) : Promise.resolve([]),
  ]);

  const marks = Object.fromEntries(att.map((a) => [a.date, a.status]));
  const totals = attendanceTotals(att.map((a) => a.status));
  const t = today();
  const elapsedTo = periodEnd(month) < t ? periodEnd(month) : t;
  const workingSoFar = periodStart(month) <= t ? workingDaysBetween(periodStart(month), elapsedTo).length : 0;
  const overtime = att.reduce((s, a) => s + a.overtimeHours, 0);
  const payable = ledger.filter((l) => l.accountCode === ACC.SALARIES_PAYABLE).reduce((s, l) => s + l.credit - l.debit, 0);
  const gross = e.basicSalary + e.allowances;

  return (
    <>
      <PageHeader
        backHref="/hr/employees"
        title={
          <span className="flex items-center gap-3">
            <EmployeeAvatar name={e.name} size="lg" />
            <span className="min-w-0">
              <span className="block truncate">{e.name}</span>
              <span className="block text-sm font-normal text-muted-foreground">
                {[e.code, e.designation, row.department].filter(Boolean).join(" · ")}
              </span>
            </span>
          </span>
        }
        badge={<StatusBadge status={e.status} />}
        actions={
          <>
            {canAttendance && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/hr/leave/new?employeeId=${e.id}`}>
                  <Plane className="size-4" />
                  Leave request
                </Link>
              </Button>
            )}
            {canPayroll && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/hr/advances/new?employeeId=${e.id}`}>
                  <HandCoins className="size-4" />
                  Pay advance
                </Link>
              </Button>
            )}
            {canManage && (
              <Button asChild size="sm">
                <Link href={`/hr/employees/${e.id}/edit`}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross monthly salary" value={formatMoney(gross)} icon={Wallet} hint={`Basic ${formatMoney(e.basicSalary)} + allowances ${formatMoney(e.allowances)}`} />
        <StatCard
          label={`Attendance · ${monthLabel(month)}`}
          value={`${totals.present + totals.late + totals.half_day} / ${workingSoFar}`}
          icon={CalendarCheck}
          tone="success"
          hint={`${totals.absent} absent · ${totals.leave} on leave`}
        />
        {canPayroll && (
          <>
            <StatCard label="Advance balance" value={formatMoney(row.advanceBalance)} icon={HandCoins} tone="warning" hint="Recovered through payroll" />
            <StatCard label="Salary due to employee" value={formatMoney(payable)} icon={Wallet} tone={payable > 0 ? "danger" : "info"} hint="Posted payroll not yet paid" />
          </>
        )}
      </div>

      <Tabs defaultValue={tab}>
        <div className="overflow-x-auto overflow-y-hidden pb-1.5">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="profile" className="grid gap-4 pt-2 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Personal</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Father's name" value={e.fatherName} />
                <Detail label="CNIC" value={e.cnic} />
                <Detail label="Phone" value={e.phone && <a href={`tel:${e.phone}`} className="hover:underline">{e.phone}</a>} />
                <Detail label="Email" value={e.email && <a href={`mailto:${e.email}`} className="hover:underline">{e.email}</a>} />
                <Detail label="Emergency contact" value={e.emergencyContact} />
                <Detail label="Address" value={e.address} />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Job & pay</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Department" value={row.department} />
                <Detail label="Designation" value={e.designation} />
                <Detail label="Joined" value={formatDate(e.joinDate, "long")} />
                <Detail label="Left" value={e.leaveDate ? formatDate(e.leaveDate, "long") : null} />
                <Detail label="Basic salary" value={<Money value={e.basicSalary} />} />
                <Detail label="Allowances" value={<Money value={e.allowances} />} />
                <Detail label="Commission" value={e.commissionPct ? `${formatQty(e.commissionPct)}%` : null} />
                <Detail label="Bank" value={[e.bankName, e.bankAccount].filter(Boolean).join(" · ")} />
              </dl>
            </CardContent>
          </Card>
          {e.notes && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">{e.notes}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="pt-2">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle>{monthLabel(month)}</CardTitle>
                <CardDescription>
                  {workingDaysBetween(periodStart(month), periodEnd(month)).length} working days in the month
                  {overtime > 0 && ` · ${formatQty(overtime)} overtime hours`}
                </CardDescription>
              </div>
              <MonthPicker value={month} extra={{ tab: "attendance" }} />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {STATUS_ORDER.map((s) => (
                  <div key={s} className={cn("rounded-lg px-3 py-2", ATTENDANCE_META[s].cell)}>
                    <p className="text-xs font-medium">{ATTENDANCE_META[s].label}</p>
                    <p className="tabular text-xl font-semibold">{totals[s]}</p>
                  </div>
                ))}
              </div>
              <AttendanceStrip period={month} marks={marks} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave" className="space-y-4 pt-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Balances for {year}</h3>
            <LeaveBalancesTable data={balances} linkEmployees={false} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Requests</h3>
            <LeaveTable data={leaves} canDecide={canAttendance} hideEmployee />
          </div>
        </TabsContent>

        {canPayroll && (
          <>
            <TabsContent value="advances" className="pt-2">
              <AdvancesTable
                data={advances}
                hideEmployee
                emptyAction={
                  <Button asChild size="sm">
                    <Link href={`/hr/advances/new?employeeId=${e.id}`}>Pay an advance</Link>
                  </Button>
                }
              />
            </TabsContent>
            <TabsContent value="payslips" className="pt-2">
              <EmployeePayslipsTable data={slips} />
            </TabsContent>
            <TabsContent value="ledger" className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Straight from the general ledger: advances paid and recovered (1500) and salary booked and paid (2300). A positive balance means{" "}
                {e.name.split(" ")[0]} owes the company; a negative balance is salary still due to them.
              </p>
              <EmployeeLedgerTable data={ledger} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </>
  );
}
