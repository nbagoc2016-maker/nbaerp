import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, or, SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { monthLabel, round2, today } from "@/lib/format";
import { ACC } from "@/server/services/chart-of-accounts";
import { leaveBalances } from "@/server/services/hr";
import { periodEnd, periodStart } from "@/server/services/hr-dates";
import { runPeriod } from "@/server/services/payroll";

const openAdvanceSum = sql<number>`coalesce((select sum(balance) from employee_advances ea where ea.employee_id = employees.id and ea.status = 'open'), 0)`.mapWith(Number);

// ---- Employees ------------------------------------------------------------------------------

export async function listEmployees() {
  const rows = await db
    .select({
      id: s.employees.id,
      code: s.employees.code,
      name: s.employees.name,
      phone: s.employees.phone,
      departmentId: s.employees.departmentId,
      department: s.departments.name,
      designation: s.employees.designation,
      basicSalary: s.employees.basicSalary,
      allowances: s.employees.allowances,
      status: s.employees.status,
      joinDate: s.employees.joinDate,
      advanceBalance: openAdvanceSum,
    })
    .from(s.employees)
    .leftJoin(s.departments, eq(s.departments.id, s.employees.departmentId))
    .orderBy(asc(s.employees.name));
  return rows.map((r) => ({ ...r, gross: round2(r.basicSalary + r.allowances) }));
}
export type EmployeeRow = Awaited<ReturnType<typeof listEmployees>>[number];

export async function employeeKpis() {
  const t = today();
  const [staff] = await db
    .select({
      headcount: sql<number>`count(*)`.mapWith(Number),
      cost: sql<number>`coalesce(sum(${s.employees.basicSalary} + ${s.employees.allowances}), 0)`.mapWith(Number),
    })
    .from(s.employees)
    .where(inArray(s.employees.status, ["active", "on_leave"]));
  const [present] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(s.attendance)
    .where(and(eq(s.attendance.date, t), inArray(s.attendance.status, ["present", "late", "half_day"])));
  const [marked] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(s.attendance).where(eq(s.attendance.date, t));
  const [adv] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number), total: sql<number>`coalesce(sum(${s.employeeAdvances.balance}), 0)`.mapWith(Number) })
    .from(s.employeeAdvances)
    .where(eq(s.employeeAdvances.status, "open"));
  return { headcount: staff.headcount, monthlyCost: round2(staff.cost), presentToday: present.n, markedToday: marked.n, openAdvances: adv.n, openAdvanceTotal: round2(adv.total) };
}

export async function departmentsWithCounts() {
  return db
    .select({
      id: s.departments.id,
      name: s.departments.name,
      employees: sql<number>`(select count(*) from employees e where e.department_id = departments.id)`.mapWith(Number),
    })
    .from(s.departments)
    .orderBy(asc(s.departments.name));
}

export async function listLeaveTypes() {
  return db.select().from(s.leaveTypes).orderBy(asc(s.leaveTypes.name));
}

export async function getEmployee(id: string) {
  const [row] = await db
    .select({ employee: s.employees, department: s.departments.name, advanceBalance: openAdvanceSum })
    .from(s.employees)
    .leftJoin(s.departments, eq(s.departments.id, s.employees.departmentId))
    .where(eq(s.employees.id, id));
  return row ?? null;
}

export async function employeeAttendance(employeeId: string, period: string) {
  return db
    .select({ date: s.attendance.date, status: s.attendance.status, checkIn: s.attendance.checkIn, checkOut: s.attendance.checkOut, overtimeHours: s.attendance.overtimeHours, notes: s.attendance.notes })
    .from(s.attendance)
    .where(and(eq(s.attendance.employeeId, employeeId), gte(s.attendance.date, periodStart(period)), lte(s.attendance.date, periodEnd(period))))
    .orderBy(asc(s.attendance.date));
}

export async function employeeAdvancesList(employeeId: string) {
  return db
    .select()
    .from(s.employeeAdvances)
    .where(eq(s.employeeAdvances.employeeId, employeeId))
    .orderBy(desc(s.employeeAdvances.date), desc(s.employeeAdvances.number));
}

export async function employeePayslips(employeeId: string) {
  const rows = await db
    .select({
      id: s.payslips.id,
      runId: s.payrollRuns.id,
      runNumber: s.payrollRuns.number,
      period: s.payrollRuns.period,
      runStatus: s.payrollRuns.status,
      gross: s.payslips.gross,
      advanceDeduction: s.payslips.advanceDeduction,
      otherDeduction: s.payslips.otherDeduction,
      absenceDeduction: s.payslips.absenceDeduction,
      net: s.payslips.net,
      paidAmount: s.payslips.paidAmount,
      status: s.payslips.status,
    })
    .from(s.payslips)
    .innerJoin(s.payrollRuns, eq(s.payrollRuns.id, s.payslips.runId))
    .where(eq(s.payslips.employeeId, employeeId))
    .orderBy(desc(s.payrollRuns.period));
  return rows.map((r) => ({ ...r, period: runPeriod(r.period) }));
}

/** Plain-English description for an employee GL line. */
function describe(l: { sourceType: string; sourceNumber: string | null; accountCode: string; memo: string | null; entryMemo: string | null; debit: number }) {
  if (l.memo) return l.memo;
  switch (l.sourceType) {
    case "employee_advance":
      return `Advance ${l.sourceNumber ?? ""} paid`.trim();
    case "payroll":
      return l.accountCode === ACC.SALARIES_PAYABLE ? "Net salary due" : "Advance recovered from salary";
    case "salary_payment":
      return `Salary paid ${l.sourceNumber ?? ""}`.trim();
    default:
      return l.entryMemo ?? (l.debit > 0 ? "Debit" : "Credit");
  }
}

/**
 * Employee ledger straight from the GL: advance (1500) and salaries payable (2300) lines tagged
 * with the employee. Balance > 0 means the employee owes the company; < 0 means salary is due to them.
 */
export async function employeeLedger(employeeId: string) {
  const rows = await db
    .select({
      id: s.journalLines.id,
      date: s.journalLines.date,
      debit: s.journalLines.debit,
      credit: s.journalLines.credit,
      memo: s.journalLines.memo,
      accountCode: s.accounts.code,
      accountName: s.accounts.name,
      entryId: s.journalEntries.id,
      entryNumber: s.journalEntries.number,
      entryMemo: s.journalEntries.memo,
      sourceType: s.journalEntries.sourceType,
      sourceId: s.journalEntries.sourceId,
      sourceNumber: s.journalEntries.sourceNumber,
    })
    .from(s.journalLines)
    .innerJoin(s.journalEntries, eq(s.journalEntries.id, s.journalLines.entryId))
    .innerJoin(s.accounts, eq(s.accounts.id, s.journalLines.accountId))
    .where(
      and(
        eq(s.journalLines.partyType, "employee"),
        eq(s.journalLines.partyId, employeeId),
        eq(s.journalEntries.status, "posted"),
        inArray(s.accounts.code, [ACC.EMPLOYEE_ADVANCES, ACC.SALARIES_PAYABLE])
      )
    )
    .orderBy(asc(s.journalLines.date), asc(s.journalEntries.createdAt), asc(s.journalLines.lineNo));
  let balance = 0;
  return rows.map((r) => {
    balance = round2(balance + r.debit - r.credit);
    return { ...r, description: describe(r), balance };
  });
}
export type LedgerRow = Awaited<ReturnType<typeof employeeLedger>>[number];

// ---- Attendance -----------------------------------------------------------------------------

async function isPeriodPosted(period: string) {
  const [r] = await db
    .select({ id: s.payrollRuns.id })
    .from(s.payrollRuns)
    .where(and(eq(s.payrollRuns.period, period), eq(s.payrollRuns.status, "posted")));
  return !!r;
}

/** Employees to show on a day's sheet: employed on that date. */
function employedOn(from: string, to: string) {
  const test: SQL<unknown> | undefined = and(
    lte(s.employees.joinDate, to),
    or(sql`${s.employees.leaveDate} is null`, gte(s.employees.leaveDate, from)),
    or(inArray(s.employees.status, ["active", "on_leave"]), gte(s.employees.leaveDate, from))
  );
  console.log("test", test?.queryChunks);
  return test;
}

export async function attendanceSheet(date: string) {
  const staff = await db
    .select({ id: s.employees.id, code: s.employees.code, name: s.employees.name, designation: s.employees.designation, department: s.departments.name })
    .from(s.employees)
    .leftJoin(s.departments, eq(s.departments.id, s.employees.departmentId))
    .where(employedOn(date, date))
    .orderBy(asc(s.employees.name));
  console.log("staff", staff);
  console.log("date", date);
  console.log("employ", employedOn(date, date));
  const marks = await db.select().from(s.attendance).where(eq(s.attendance.date, date));
  const byEmp = new Map(marks.map((m) => [m.employeeId, m]));
  return {
    locked: await isPeriodPosted(date.slice(0, 7)),
    rows: staff.map((e) => {
      const m = byEmp.get(e.id);
      return {
        ...e,
        status: m?.status ?? null,
        checkIn: m?.checkIn ?? "",
        checkOut: m?.checkOut ?? "",
        overtimeHours: m?.overtimeHours ?? 0,
        notes: m?.notes ?? "",
      };
    }),
  };
}
export type SheetRow = Awaited<ReturnType<typeof attendanceSheet>>["rows"][number];

export async function attendanceMonth(period: string) {
  const from = periodStart(period);
  const to = periodEnd(period);
  const staff = await db
    .select({ id: s.employees.id, code: s.employees.code, name: s.employees.name, department: s.departments.name })
    .from(s.employees)
    .leftJoin(s.departments, eq(s.departments.id, s.employees.departmentId))
    .where(employedOn(from, to))
    .orderBy(asc(s.employees.name));
  const marks = await db
    .select({ employeeId: s.attendance.employeeId, date: s.attendance.date, status: s.attendance.status })
    .from(s.attendance)
    .where(and(gte(s.attendance.date, from), lte(s.attendance.date, to)));
  const map: Record<string, Record<string, string>> = {};
  for (const m of marks) (map[m.employeeId] ??= {})[m.date] = m.status;
  return { staff, marks: map };
}

// ---- Leave ----------------------------------------------------------------------------------

export async function listLeaveRequests(opts: { status?: string; employeeId?: string } = {}) {
  const statuses = ["pending", "approved", "rejected", "cancelled"] as const;
  const status = statuses.find((x) => x === opts.status);
  return db
    .select({
      id: s.leaveRequests.id,
      employeeId: s.leaveRequests.employeeId,
      employee: s.employees.name,
      code: s.employees.code,
      leaveType: s.leaveTypes.name,
      isPaid: s.leaveTypes.isPaid,
      fromDate: s.leaveRequests.fromDate,
      toDate: s.leaveRequests.toDate,
      days: s.leaveRequests.days,
      reason: s.leaveRequests.reason,
      status: s.leaveRequests.status,
      decidedBy: s.users.name,
      createdAt: s.leaveRequests.createdAt,
    })
    .from(s.leaveRequests)
    .innerJoin(s.employees, eq(s.employees.id, s.leaveRequests.employeeId))
    .innerJoin(s.leaveTypes, eq(s.leaveTypes.id, s.leaveRequests.leaveTypeId))
    .leftJoin(s.users, eq(s.users.id, s.leaveRequests.decidedBy))
    .where(and(status ? eq(s.leaveRequests.status, status) : undefined, opts.employeeId ? eq(s.leaveRequests.employeeId, opts.employeeId) : undefined))
    .orderBy(desc(s.leaveRequests.fromDate));
}
export type LeaveRow = Awaited<ReturnType<typeof listLeaveRequests>>[number];

export async function leaveCounts() {
  const rows = await db
    .select({ status: s.leaveRequests.status, n: sql<number>`count(*)`.mapWith(Number) })
    .from(s.leaveRequests)
    .groupBy(s.leaveRequests.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

/** Balances per employee per leave type for a year. */
export async function leaveBalanceTable(year: number, employeeId?: string) {
  const { types, taken } = await leaveBalances(db, year, employeeId);
  const staff = await db
    .select({ id: s.employees.id, code: s.employees.code, name: s.employees.name })
    .from(s.employees)
    .where(employeeId ? eq(s.employees.id, employeeId) : inArray(s.employees.status, ["active", "on_leave"]))
    .orderBy(asc(s.employees.name));
  return {
    types: types.map((t) => ({ id: t.id, name: t.name, daysPerYear: t.daysPerYear, isPaid: t.isPaid })),
    rows: staff.map((e) => ({
      ...e,
      balances: types.map((t) => {
        const used = taken(e.id, t.id);
        return { typeId: t.id, entitled: t.daysPerYear, taken: used, remaining: t.daysPerYear > 0 ? t.daysPerYear - used : null };
      }),
    })),
  };
}
export type LeaveBalanceData = Awaited<ReturnType<typeof leaveBalanceTable>>;

// ---- Advances -------------------------------------------------------------------------------

export async function listAdvances() {
  return db
    .select({
      id: s.employeeAdvances.id,
      number: s.employeeAdvances.number,
      date: s.employeeAdvances.date,
      employeeId: s.employeeAdvances.employeeId,
      employee: s.employees.name,
      code: s.employees.code,
      kind: s.employeeAdvances.kind,
      amount: s.employeeAdvances.amount,
      installmentAmount: s.employeeAdvances.installmentAmount,
      balance: s.employeeAdvances.balance,
      status: s.employeeAdvances.status,
      reason: s.employeeAdvances.reason,
    })
    .from(s.employeeAdvances)
    .innerJoin(s.employees, eq(s.employees.id, s.employeeAdvances.employeeId))
    .orderBy(desc(s.employeeAdvances.date), desc(s.employeeAdvances.number));
}
export type AdvanceRow = Awaited<ReturnType<typeof listAdvances>>[number];

export async function getAdvance(id: string) {
  const [row] = await db
    .select({
      advance: s.employeeAdvances,
      employee: s.employees.name,
      employeeCode: s.employees.code,
      account: s.accounts.name,
      accountCode: s.accounts.code,
      journalNumber: s.journalEntries.number,
      createdBy: s.users.name,
    })
    .from(s.employeeAdvances)
    .innerJoin(s.employees, eq(s.employees.id, s.employeeAdvances.employeeId))
    .leftJoin(s.accounts, eq(s.accounts.id, s.employeeAdvances.paidFromAccountId))
    .leftJoin(s.journalEntries, eq(s.journalEntries.id, s.employeeAdvances.journalEntryId))
    .leftJoin(s.users, eq(s.users.id, s.employeeAdvances.createdBy))
    .where(eq(s.employeeAdvances.id, id));
  if (!row) return null;
  const recoveries = await db
    .select({
      id: s.advanceRecoveries.id,
      date: s.advanceRecoveries.date,
      amount: s.advanceRecoveries.amount,
      runId: s.payrollRuns.id,
      runNumber: s.payrollRuns.number,
      period: s.payrollRuns.period,
      payslipId: s.advanceRecoveries.payslipId,
    })
    .from(s.advanceRecoveries)
    .innerJoin(s.payrollRuns, eq(s.payrollRuns.id, s.advanceRecoveries.runId))
    .where(eq(s.advanceRecoveries.advanceId, id))
    .orderBy(asc(s.advanceRecoveries.date));
  return { ...row, recoveries: recoveries.map((r) => ({ ...r, period: runPeriod(r.period) })) };
}

// ---- Payroll --------------------------------------------------------------------------------

export async function listPayrollRuns() {
  const rows = await db
    .select({
      id: s.payrollRuns.id,
      number: s.payrollRuns.number,
      period: s.payrollRuns.period,
      date: s.payrollRuns.date,
      status: s.payrollRuns.status,
      totalGross: s.payrollRuns.totalGross,
      totalDeductions: s.payrollRuns.totalDeductions,
      totalNet: s.payrollRuns.totalNet,
      totalPaid: s.payrollRuns.totalPaid,
      employees: sql<number>`(select count(*) from payslips p where p.run_id = payroll_runs.id)`.mapWith(Number),
    })
    .from(s.payrollRuns)
    .orderBy(desc(s.payrollRuns.date), desc(s.payrollRuns.number));
  return rows.map((r) => ({ ...r, period: runPeriod(r.period), periodLabel: monthLabel(runPeriod(r.period)) }));
}
export type RunRow = Awaited<ReturnType<typeof listPayrollRuns>>[number];

export async function getPayrollRun(id: string) {
  const [run] = await db.select().from(s.payrollRuns).where(eq(s.payrollRuns.id, id));
  if (!run) return null;
  const period = runPeriod(run.period);
  const slips = await db
    .select({
      slip: s.payslips,
      code: s.employees.code,
      name: s.employees.name,
      designation: s.employees.designation,
      department: s.departments.name,
      commissionPct: s.employees.commissionPct,
      overtimeHours: sql<number>`coalesce((select sum(overtime_hours) from attendance a where a.employee_id = payslips.employee_id and a.date between ${periodStart(period)} and ${periodEnd(period)}), 0)`.mapWith(Number),
    })
    .from(s.payslips)
    .innerJoin(s.employees, eq(s.employees.id, s.payslips.employeeId))
    .leftJoin(s.departments, eq(s.departments.id, s.employees.departmentId))
    .where(eq(s.payslips.runId, id))
    .orderBy(asc(s.employees.name));
  const payments = await db
    .select({
      id: s.salaryPayments.id,
      number: s.salaryPayments.number,
      date: s.salaryPayments.date,
      employee: s.employees.name,
      amount: s.salaryPayments.amount,
      method: s.salaryPayments.method,
      reference: s.salaryPayments.reference,
      status: s.salaryPayments.status,
      account: s.accounts.name,
    })
    .from(s.salaryPayments)
    .innerJoin(s.payslips, eq(s.payslips.id, s.salaryPayments.payslipId))
    .innerJoin(s.employees, eq(s.employees.id, s.salaryPayments.employeeId))
    .leftJoin(s.accounts, eq(s.accounts.id, s.salaryPayments.paidFromAccountId))
    .where(eq(s.payslips.runId, id))
    .orderBy(desc(s.salaryPayments.date), desc(s.salaryPayments.number));
  const [je] = run.journalEntryId ? await db.select({ number: s.journalEntries.number }).from(s.journalEntries).where(eq(s.journalEntries.id, run.journalEntryId)) : [];
  return { run: { ...run, period }, slips, payments, journalNumber: je?.number ?? null };
}
export type RunDetail = NonNullable<Awaited<ReturnType<typeof getPayrollRun>>>;

export async function getPayslip(id: string) {
  const [row] = await db
    .select({ slip: s.payslips, run: s.payrollRuns, employee: s.employees, department: s.departments.name })
    .from(s.payslips)
    .innerJoin(s.payrollRuns, eq(s.payrollRuns.id, s.payslips.runId))
    .innerJoin(s.employees, eq(s.employees.id, s.payslips.employeeId))
    .leftJoin(s.departments, eq(s.departments.id, s.employees.departmentId))
    .where(eq(s.payslips.id, id));
  if (!row) return null;
  const payments = await db
    .select()
    .from(s.salaryPayments)
    .where(and(eq(s.salaryPayments.payslipId, id), eq(s.salaryPayments.status, "posted")))
    .orderBy(asc(s.salaryPayments.date));
  return { ...row, run: { ...row.run, period: runPeriod(row.run.period) }, payments };
}

export async function suggestedNextPeriod() {
  const [last] = await db
    .select({ period: s.payrollRuns.period })
    .from(s.payrollRuns)
    .where(sql`${s.payrollRuns.status} <> 'void'`)
    .orderBy(desc(s.payrollRuns.period))
    .limit(1);
  const current = today().slice(0, 7);
  if (!last) return current;
  const [y, m] = last.period.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return next > current ? current : next;
}
