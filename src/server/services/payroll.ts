// Payroll: monthly runs, payslip calculation, posting to the GL, salary payments and voids.
//
//   earnings          = basic + allowances + overtime + commission + bonus
//   absenceDeduction  = (basic + allowances) / workingDays × absentDays
//   gross             = earnings − absenceDeduction               (what the salary expense books)
//   net               = gross − advanceDeduction − otherDeduction (what the employee is owed)
//
// Posting: Dr Salaries 6100 gross; Cr Salaries Payable 2300 net (employee); Cr Employee Advances
// 1500 recovered (employee); Cr 6100 other deductions (fines etc. reduce the expense).
import { assertCashAvailable } from "./finance-accounts";
import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  advanceRecoveries,
  attendance,
  employeeAdvances,
  employees,
  leaveRequests,
  leaveTypes,
  payrollRuns,
  payslips,
  salaryPayments,
} from "@/db/schema";
import { formatMoney, monthLabel, round2 } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { assertCashBankAccount } from "./hr";
import { isSunday, monthDays, periodEnd, periodStart, workingDaysBetween } from "./hr-dates";
import {
  payAllSchema,
  payrollRunSchema,
  payslipEditSchema,
  salaryPaymentSchema,
  voidSchema,
  type PayAllInput,
  type PayrollRunInput,
  type PayslipEditInput,
  type SalaryPaymentInput,
} from "./hr-schemas";
import { nextNumber } from "./numbering";
import type { z } from "zod";

type Employee = typeof employees.$inferSelect;
type Payslip = typeof payslips.$inferSelect;
type Advance = typeof employeeAdvances.$inferSelect;

/** Period part of a run (voided runs carry a suffix so the month can be run again). */
export const runPeriod = (period: string) => period.slice(0, 7);

// ---- Calculation ----------------------------------------------------------------------------

export interface SlipEdits {
  overtime: number;
  commission: number;
  bonus: number;
  otherDeduction: number;
}

export interface SlipCalc extends SlipEdits {
  workingDays: number;
  presentDays: number;
  absentDays: number;
  basic: number;
  allowances: number;
  absenceDeduction: number;
  advanceDeduction: number;
  gross: number;
  net: number;
}

/** Gross and net from the stored components (used after grid edits). */
export function slipTotals(s: Pick<SlipCalc, "basic" | "allowances" | "overtime" | "commission" | "bonus" | "absenceDeduction" | "advanceDeduction" | "otherDeduction">) {
  const earnings = round2(s.basic + s.allowances + s.overtime + s.commission + s.bonus);
  const gross = round2(earnings - s.absenceDeduction);
  const net = round2(gross - s.advanceDeduction - s.otherDeduction);
  return { earnings, gross, net };
}

/**
 * Pure payslip calculation for one employee and month.
 * - working days: days in the month excluding Sundays
 * - absent days: absent = 1, half day = 0.5, leave of an unpaid type = 1, and working days before
 *   joining / after leaving
 * - advance deduction: Σ min(installment, balance) over open advances, capped so net ≥ 0
 */
export function calculateSlip(input: {
  period: string;
  employee: Pick<Employee, "basicSalary" | "allowances" | "joinDate" | "leaveDate">;
  attendance: { date: string; status: string }[];
  unpaidLeaveDays: Set<string>;
  advances: Pick<Advance, "installmentAmount" | "balance">[];
  edits?: Partial<SlipEdits>;
}): SlipCalc {
  const { employee: e } = input;
  const days = workingDaysBetween(periodStart(input.period), periodEnd(input.period));
  const workingDays = days.length;
  const employed = (d: string) => d >= e.joinDate && (!e.leaveDate || d <= e.leaveDate);

  let absent = days.filter((d) => !employed(d)).length;
  for (const a of input.attendance) {
    if (isSunday(a.date) || !employed(a.date) || a.date.slice(0, 7) !== input.period) continue;
    if (a.status === "absent") absent += 1;
    else if (a.status === "half_day") absent += 0.5;
    else if (a.status === "leave" && input.unpaidLeaveDays.has(a.date)) absent += 1;
  }
  const absentDays = Math.min(workingDays, absent);
  const basic = round2(e.basicSalary);
  const allowances = round2(e.allowances);
  const absenceDeduction = workingDays ? round2(((basic + allowances) / workingDays) * absentDays) : 0;

  const edits: SlipEdits = {
    overtime: round2(input.edits?.overtime ?? 0),
    commission: round2(input.edits?.commission ?? 0),
    bonus: round2(input.edits?.bonus ?? 0),
    otherDeduction: round2(input.edits?.otherDeduction ?? 0),
  };
  const { gross } = slipTotals({ basic, allowances, ...edits, absenceDeduction, advanceDeduction: 0 });
  const due = round2(input.advances.reduce((s, a) => s + Math.min(a.installmentAmount, a.balance), 0));
  const advanceDeduction = round2(Math.max(0, Math.min(due, gross - edits.otherDeduction)));
  const net = round2(gross - advanceDeduction - edits.otherDeduction);

  return {
    workingDays,
    presentDays: workingDays - absentDays,
    absentDays,
    basic,
    allowances,
    ...edits,
    absenceDeduction,
    advanceDeduction,
    gross,
    net,
  };
}

/** Employees to pay for a month: active (or on leave) and joined by month end, plus leavers during the month. */
async function eligibleEmployees(db: DbOrTx, period: string) {
  const start = periodStart(period);
  const end = periodEnd(period);
  return db
    .select()
    .from(employees)
    .where(
      and(
        lte(employees.joinDate, end),
        or(inArray(employees.status, ["active", "on_leave"]), gte(employees.leaveDate, start)),
        or(sql`${employees.leaveDate} is null`, gte(employees.leaveDate, start))
      )
    )
    .orderBy(asc(employees.code));
}

/** Everything calculateSlip needs for these employees and month, loaded in a few queries. */
async function loadInputs(db: DbOrTx, period: string, employeeIds: string[]) {
  const start = periodStart(period);
  const end = periodEnd(period);
  const att = employeeIds.length
    ? await db
        .select({ employeeId: attendance.employeeId, date: attendance.date, status: attendance.status })
        .from(attendance)
        .where(and(inArray(attendance.employeeId, employeeIds), gte(attendance.date, start), lte(attendance.date, end)))
    : [];
  const unpaid = employeeIds.length
    ? await db
        .select({ employeeId: leaveRequests.employeeId, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate })
        .from(leaveRequests)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(
          and(
            inArray(leaveRequests.employeeId, employeeIds),
            eq(leaveRequests.status, "approved"),
            eq(leaveTypes.isPaid, false),
            lte(leaveRequests.fromDate, end),
            gte(leaveRequests.toDate, start)
          )
        )
    : [];
  const advs = employeeIds.length
    ? await db
        .select()
        .from(employeeAdvances)
        .where(and(inArray(employeeAdvances.employeeId, employeeIds), eq(employeeAdvances.status, "open"), lte(employeeAdvances.date, end)))
        .orderBy(asc(employeeAdvances.date), asc(employeeAdvances.number))
    : [];

  const days = new Set(monthDays(period));
  return {
    attendanceFor: (id: string) => att.filter((a) => a.employeeId === id),
    unpaidFor: (id: string) => {
      const set = new Set<string>();
      for (const r of unpaid.filter((u) => u.employeeId === id)) for (const d of days) if (d >= r.fromDate && d <= r.toDate) set.add(d);
      return set;
    },
    advancesFor: (id: string) => advs.filter((a) => a.employeeId === id),
  };
}

async function refreshRunTotals(db: DbOrTx, runId: string) {
  const [t] = await db
    .select({
      gross: sql<number>`coalesce(sum(${payslips.gross}), 0)`.mapWith(Number),
      deductions: sql<number>`coalesce(sum(${payslips.advanceDeduction} + ${payslips.otherDeduction}), 0)`.mapWith(Number),
      net: sql<number>`coalesce(sum(${payslips.net}), 0)`.mapWith(Number),
      paid: sql<number>`coalesce(sum(${payslips.paidAmount}), 0)`.mapWith(Number),
    })
    .from(payslips)
    .where(eq(payslips.runId, runId));
  await db
    .update(payrollRuns)
    .set({ totalGross: round2(t.gross), totalDeductions: round2(t.deductions), totalNet: round2(t.net), totalPaid: round2(t.paid) })
    .where(eq(payrollRuns.id, runId));
}

async function getRun(db: DbOrTx, id: string) {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id));
  if (!run) throw new AppError("Payroll run not found");
  return run;
}

// ---- Runs -----------------------------------------------------------------------------------

/** Create a draft run for a month with one payslip per employee to be paid. */
export async function createPayrollRun(db: DbOrTx, actor: Actor | null, raw: PayrollRunInput) {
  const input = payrollRunSchema.parse(raw);
  const [existing] = await db.select().from(payrollRuns).where(eq(payrollRuns.period, input.period));
  if (existing) throw new AppError(`Payroll for ${monthLabel(input.period)} already exists (${existing.number})`);

  const staff = await eligibleEmployees(db, input.period);
  if (!staff.length) throw new AppError(`No employees to pay for ${monthLabel(input.period)}`);

  const number = await nextNumber(db, "PRL");
  const [run] = await db
    .insert(payrollRuns)
    .values({ number, period: input.period, date: input.date ?? periodEnd(input.period), notes: input.notes, createdBy: actor?.id ?? null })
    .returning();

  const data = await loadInputs(db, input.period, staff.map((e) => e.id));
  await db.insert(payslips).values(
    staff.map((e) => ({
      runId: run.id,
      employeeId: e.id,
      ...calculateSlip({
        period: input.period,
        employee: e,
        attendance: data.attendanceFor(e.id),
        unpaidLeaveDays: data.unpaidFor(e.id),
        advances: data.advancesFor(e.id),
      }),
    }))
  );
  await refreshRunTotals(db, run.id);
  await logAudit(db, actor, {
    action: "create",
    entity: "payroll_run",
    entityId: run.id,
    summary: `Created payroll ${number} for ${monthLabel(input.period)} (${staff.length} employees)`,
  });
  return { id: run.id, number };
}

/**
 * Re-read salaries, attendance and advances for a draft run, keeping the amounts typed into the
 * grid (overtime, commission, bonus, other deduction). Adds employees who became eligible.
 */
export async function recalculateRun(db: DbOrTx, actor: Actor | null, runId: string) {
  const run = await getRun(db, runId);
  if (run.status !== "draft") throw new AppError("Only draft payroll runs can be recalculated");
  const existing = await db.select().from(payslips).where(eq(payslips.runId, runId));
  const byEmp = new Map(existing.map((p) => [p.employeeId, p]));
  const staff = await eligibleEmployees(db, run.period);
  const allIds = [...new Set([...staff.map((e) => e.id), ...existing.map((p) => p.employeeId)])];
  const emps = await db.select().from(employees).where(inArray(employees.id, allIds));
  const data = await loadInputs(db, run.period, allIds);

  for (const e of emps) {
    const slip = byEmp.get(e.id);
    const calc = calculateSlip({
      period: run.period,
      employee: e,
      attendance: data.attendanceFor(e.id),
      unpaidLeaveDays: data.unpaidFor(e.id),
      advances: data.advancesFor(e.id),
      edits: slip ?? undefined,
    });
    if (slip) await db.update(payslips).set(calc).where(eq(payslips.id, slip.id));
    else await db.insert(payslips).values({ runId, employeeId: e.id, ...calc });
  }
  await refreshRunTotals(db, runId);
  await logAudit(db, actor, { action: "update", entity: "payroll_run", entityId: runId, summary: `Recalculated payroll ${run.number}` });
  return { id: runId };
}

/** Save grid edits on a draft run (overtime, commission, bonus, other deduction, notes). */
export async function updatePayslips(db: DbOrTx, actor: Actor | null, raw: PayslipEditInput) {
  const input = payslipEditSchema.parse(raw);
  const run = await getRun(db, input.runId);
  if (run.status !== "draft") throw new AppError("Posted payroll can't be edited. Void it first.");
  const slips = await db
    .select({ slip: payslips, name: employees.name })
    .from(payslips)
    .innerJoin(employees, eq(employees.id, payslips.employeeId))
    .where(eq(payslips.runId, run.id));
  const byId = new Map(slips.map((s) => [s.slip.id, s]));

  for (const r of input.rows) {
    const found = byId.get(r.id);
    if (!found) throw new AppError("A payslip in the grid doesn't belong to this run");
    const s = found.slip;
    const edits = { overtime: round2(r.overtime), commission: round2(r.commission), bonus: round2(r.bonus), otherDeduction: round2(r.otherDeduction) };
    const t = slipTotals({ ...s, ...edits });
    // Keep net ≥ 0: an advance recovery shrinks before net pay goes negative
    let advanceDeduction = s.advanceDeduction;
    if (t.net < 0) advanceDeduction = round2(Math.max(0, s.advanceDeduction + t.net));
    const net = round2(t.gross - advanceDeduction - edits.otherDeduction);
    if (net < 0) throw new AppError(`Net pay for ${found.name} would be negative (${formatMoney(net)}). Reduce the deduction.`);
    await db.update(payslips).set({ ...edits, advanceDeduction, gross: t.gross, net, notes: r.notes }).where(eq(payslips.id, s.id));
  }
  await refreshRunTotals(db, run.id);
  return { id: run.id };
}

export async function deleteDraftRun(db: DbOrTx, actor: Actor | null, runId: string) {
  const run = await getRun(db, runId);
  if (run.status !== "draft") throw new AppError("Only draft payroll runs can be deleted. Void a posted run instead.");
  await db.delete(payrollRuns).where(eq(payrollRuns.id, runId));
  await logAudit(db, actor, { action: "delete", entity: "payroll_run", entityId: runId, summary: `Deleted draft payroll ${run.number} (${monthLabel(run.period)})` });
  return { id: runId };
}

/** Split a payslip's advance deduction across the employee's open advances, oldest first. */
function allocateRecovery(amount: number, advances: Advance[]) {
  const out: { advance: Advance; amount: number }[] = [];
  let left = round2(amount);
  const remaining = new Map(advances.map((a) => [a.id, a.balance]));
  // First each advance's installment, then anything still left from the oldest balances
  for (const pass of ["installment", "balance"] as const) {
    for (const a of advances) {
      if (left <= 0) break;
      const cap = pass === "installment" ? Math.min(a.installmentAmount, remaining.get(a.id)!) : remaining.get(a.id)!;
      const take = round2(Math.min(left, cap));
      if (take <= 0) continue;
      const existing = out.find((o) => o.advance.id === a.id);
      if (existing) existing.amount = round2(existing.amount + take);
      else out.push({ advance: a, amount: take });
      remaining.set(a.id, round2(remaining.get(a.id)! - take));
      left = round2(left - take);
    }
  }
  return { allocations: out, unallocated: left };
}

/** Post a draft run: one journal, advance balances reduced (settled at zero). */
export async function postPayrollRun(db: DbOrTx, actor: Actor | null, runId: string) {
  const run = await getRun(db, runId);
  if (run.status !== "draft") throw new AppError(`This payroll is already ${run.status}`);
  const rows = await db
    .select({ slip: payslips, name: employees.name, code: employees.code })
    .from(payslips)
    .innerJoin(employees, eq(employees.id, payslips.employeeId))
    .where(eq(payslips.runId, runId))
    .orderBy(asc(employees.code));
  if (!rows.length) throw new AppError("This payroll has no payslips");

  const month = monthLabel(run.period);
  const advs = await db
    .select()
    .from(employeeAdvances)
    .where(and(inArray(employeeAdvances.employeeId, rows.map((r) => r.slip.employeeId)), eq(employeeAdvances.status, "open")))
    .orderBy(asc(employeeAdvances.date), asc(employeeAdvances.number));

  const recoveries: { advance: Advance; slip: Payslip; amount: number }[] = [];
  for (const { slip, name } of rows) {
    const t = slipTotals(slip);
    if (Math.abs(t.gross - slip.gross) > 0.005 || Math.abs(t.net - slip.net) > 0.005) {
      throw new AppError(`Payslip totals for ${name} are out of date. Recalculate the run and try again.`);
    }
    if (slip.net < 0) throw new AppError(`Net pay for ${name} is negative`);
    if (slip.advanceDeduction > 0) {
      const { allocations, unallocated } = allocateRecovery(slip.advanceDeduction, advs.filter((a) => a.employeeId === slip.employeeId));
      if (unallocated > 0.005) {
        throw new AppError(`${name}'s advance balance changed since this payroll was calculated. Recalculate the run and try again.`);
      }
      for (const a of allocations) recoveries.push({ advance: a.advance, slip, amount: a.amount });
    }
  }

  const totalGross = round2(rows.reduce((s, r) => s + r.slip.gross, 0));
  const totalOther = round2(rows.reduce((s, r) => s + r.slip.otherDeduction, 0));
  if (totalGross <= 0) throw new AppError("There is nothing to post: total gross salary is zero");

  const je = await postJournal(db, actor, {
    date: run.date,
    memo: `Payroll ${run.number} — salaries for ${month}`,
    sourceType: "payroll",
    sourceId: run.id,
    sourceNumber: run.number,
    lines: [
      { account: ACC.SALARIES, debit: totalGross, memo: `Salaries & wages for ${month}` },
      ...rows.map((r) => ({
        account: ACC.SALARIES_PAYABLE,
        credit: r.slip.net,
        partyType: "employee" as const,
        partyId: r.slip.employeeId,
        memo: `Net salary for ${month} due to ${r.name}`,
      })),
      ...rows.map((r) => ({
        account: ACC.EMPLOYEE_ADVANCES,
        credit: r.slip.advanceDeduction,
        partyType: "employee" as const,
        partyId: r.slip.employeeId,
        memo: `Advance recovered from ${r.name}'s ${month} salary`,
      })),
      { account: ACC.SALARIES, credit: totalOther, memo: `Other deductions from ${month} salaries` },
    ],
  });

  for (const r of recoveries) {
    const [adv] = await db.select().from(employeeAdvances).where(eq(employeeAdvances.id, r.advance.id));
    const balance = round2(adv.balance - r.amount);
    await db
      .update(employeeAdvances)
      .set({ balance, status: balance <= 0.005 ? "settled" : "open" })
      .where(eq(employeeAdvances.id, adv.id));
    await db.insert(advanceRecoveries).values({ advanceId: adv.id, runId: run.id, payslipId: r.slip.id, date: run.date, amount: r.amount });
  }

  await db.update(payrollRuns).set({ status: "posted", journalEntryId: je.id }).where(eq(payrollRuns.id, run.id));
  await refreshRunTotals(db, run.id);
  await logAudit(db, actor, {
    action: "post",
    entity: "payroll_run",
    entityId: run.id,
    summary: `Posted payroll ${run.number} for ${month}: gross ${formatMoney(totalGross)}, ${rows.length} employees`,
  });
  return { id: run.id, journalEntryId: je.id };
}

/** Void a posted run that has no salary payments: reverses the journal and restores advances. */
export async function voidPayrollRun(db: DbOrTx, actor: Actor | null, raw: z.input<typeof voidSchema>) {
  const input = voidSchema.parse(raw);
  const run = await getRun(db, input.id);
  if (run.status !== "posted") throw new AppError("Only posted payroll runs can be voided");
  const [paid] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(salaryPayments)
    .innerJoin(payslips, eq(payslips.id, salaryPayments.payslipId))
    .where(and(eq(payslips.runId, run.id), eq(salaryPayments.status, "posted")));
  if (paid.n > 0) throw new AppError(`Salaries have already been paid from this run (${paid.n} payment${paid.n === 1 ? "" : "s"}). Void those payments first.`);

  await voidJournal(db, actor, run.journalEntryId, input.reason ?? `Payroll ${run.number} voided`);
  const recs = await db.select().from(advanceRecoveries).where(eq(advanceRecoveries.runId, run.id));
  for (const r of recs) {
    const [adv] = await db.select().from(employeeAdvances).where(eq(employeeAdvances.id, r.advanceId));
    if (!adv || adv.status === "void") continue;
    await db
      .update(employeeAdvances)
      .set({ balance: round2(adv.balance + r.amount), status: "open" })
      .where(eq(employeeAdvances.id, adv.id));
  }
  await db.delete(advanceRecoveries).where(eq(advanceRecoveries.runId, run.id));
  // Free the month so it can be run again; the voided run keeps its YYYY-MM prefix for display
  await db
    .update(payrollRuns)
    .set({ status: "void", period: `${runPeriod(run.period)}~void~${run.number}` })
    .where(eq(payrollRuns.id, run.id));
  await logAudit(db, actor, {
    action: "void",
    entity: "payroll_run",
    entityId: run.id,
    summary: `Voided payroll ${run.number} (${monthLabel(runPeriod(run.period))})${input.reason ? `: ${input.reason}` : ""}`,
  });
  return { id: run.id };
}

// ---- Salary payments ------------------------------------------------------------------------

async function settlePayslip(db: DbOrTx, payslipId: string) {
  const [s] = await db.select().from(payslips).where(eq(payslips.id, payslipId));
  const [p] = await db
    .select({ paid: sql<number>`coalesce(sum(${salaryPayments.amount}), 0)`.mapWith(Number) })
    .from(salaryPayments)
    .where(and(eq(salaryPayments.payslipId, payslipId), eq(salaryPayments.status, "posted")));
  const paidAmount = round2(p.paid);
  const status = paidAmount <= 0 ? "unpaid" : paidAmount + 0.005 >= s.net ? "paid" : "partial";
  await db.update(payslips).set({ paidAmount, status }).where(eq(payslips.id, payslipId));
  await refreshRunTotals(db, s.runId);
}

/** Pay a payslip (fully by default): Dr Salaries Payable 2300 (employee), Cr Cash/Bank. */
export async function paySalary(db: DbOrTx, actor: Actor | null, raw: SalaryPaymentInput) {
  const input = salaryPaymentSchema.parse(raw);
  const [row] = await db
    .select({ slip: payslips, run: payrollRuns, name: employees.name })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
    .innerJoin(employees, eq(employees.id, payslips.employeeId))
    .where(eq(payslips.id, input.payslipId));
  if (!row) throw new AppError("Payslip not found");
  if (row.run.status !== "posted") throw new AppError("Post the payroll before paying salaries");
  const outstanding = round2(row.slip.net - row.slip.paidAmount);
  if (outstanding <= 0) throw new AppError(`${row.name}'s salary for ${monthLabel(row.run.period)} is already paid`);
  const amount = round2(input.amount ?? outstanding);
  if (amount > outstanding + 0.005) {
    throw new AppError(`Only ${formatMoney(outstanding)} is still due to ${row.name}`, { amount: `At most ${formatMoney(outstanding)}` });
  }
  const acc = await assertCashBankAccount(db, input.paidFromAccountId);
  await assertCashAvailable(db, acc, amount, input.date);
  const month = monthLabel(row.run.period);
  const number = await nextNumber(db, "SAL");

  const [pay] = await db
    .insert(salaryPayments)
    .values({
      number,
      date: input.date,
      employeeId: row.slip.employeeId,
      payslipId: row.slip.id,
      amount,
      paidFromAccountId: acc.id,
      method: input.method,
      reference: input.reference,
      createdBy: actor?.id ?? null,
    })
    .returning();
  const je = await postJournal(db, actor, {
    date: input.date,
    memo: `Salary ${number} paid to ${row.name} for ${month}`,
    sourceType: "salary_payment",
    sourceId: pay.id,
    sourceNumber: number,
    lines: [
      { account: ACC.SALARIES_PAYABLE, debit: amount, partyType: "employee", partyId: row.slip.employeeId, memo: `${month} salary paid (${number})` },
      { account: acc.id, credit: amount, memo: `${month} salary paid to ${row.name} (${number})` },
    ],
  });
  await db.update(salaryPayments).set({ journalEntryId: je.id }).where(eq(salaryPayments.id, pay.id));
  await settlePayslip(db, row.slip.id);
  await logAudit(db, actor, {
    action: "create",
    entity: "salary_payment",
    entityId: pay.id,
    summary: `Paid ${formatMoney(amount)} salary to ${row.name} for ${month} (${number})`,
  });
  return { id: pay.id, number, amount };
}

/** Pay everything still due on a posted run from one account (one payment per employee). */
export async function payAllSalaries(db: DbOrTx, actor: Actor | null, raw: PayAllInput) {
  const input = payAllSchema.parse(raw);
  const run = await getRun(db, input.runId);
  if (run.status !== "posted") throw new AppError("Post the payroll before paying salaries");
  const due = await db
    .select()
    .from(payslips)
    .where(and(eq(payslips.runId, run.id), sql`${payslips.net} - ${payslips.paidAmount} > 0.005`));
  if (!due.length) throw new AppError("Everyone in this payroll has already been paid");
  let total = 0;
  for (const s of due) {
    const r = await paySalary(db, actor, {
      payslipId: s.id,
      date: input.date,
      paidFromAccountId: input.paidFromAccountId,
      method: input.method,
      reference: input.reference,
    });
    total = round2(total + r.amount);
  }
  return { id: run.id, count: due.length, total };
}

export async function voidSalaryPayment(db: DbOrTx, actor: Actor | null, raw: z.input<typeof voidSchema>) {
  const input = voidSchema.parse(raw);
  const [pay] = await db.select().from(salaryPayments).where(eq(salaryPayments.id, input.id));
  if (!pay) throw new AppError("Salary payment not found");
  if (pay.status === "void") throw new AppError("This payment is already void");
  await voidJournal(db, actor, pay.journalEntryId, input.reason ?? `Salary payment ${pay.number} voided`);
  await db.update(salaryPayments).set({ status: "void" }).where(eq(salaryPayments.id, pay.id));
  if (pay.payslipId) await settlePayslip(db, pay.payslipId);
  await logAudit(db, actor, {
    action: "void",
    entity: "salary_payment",
    entityId: pay.id,
    summary: `Voided salary payment ${pay.number} (${formatMoney(pay.amount)})${input.reason ? `: ${input.reason}` : ""}`,
  });
  return { id: pay.id, payslipId: pay.payslipId };
}

