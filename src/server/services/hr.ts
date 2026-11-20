// HR business logic: employees, departments, leave types, attendance, leave and advances.
// Services take (db|tx, actor, input) so actions and tests can call them directly.
import { assertCashAvailable } from "./finance-accounts";
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  accounts,
  advanceRecoveries,
  attendance,
  departments,
  employeeAdvances,
  employees,
  leaveRequests,
  leaveTypes,
  payrollRuns,
} from "@/db/schema";
import { formatMoney, round2 } from "@/lib/format";
import { AppError } from "../errors";
import { postJournal, voidJournal } from "./accounting";
import { logAudit, type Actor } from "./audit";
import { ACC } from "./chart-of-accounts";
import { workingDaysBetween } from "./hr-dates";
import {
  advanceSchema,
  attendanceSchema,
  departmentSchema,
  employeeSchema,
  leaveDecisionSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  voidSchema,
  type AdvanceInput,
  type AttendanceInput,
  type EmployeeInput,
  type LeaveRequestInput,
} from "./hr-schemas";
import { nextNumber } from "./numbering";
import type { z } from "zod";

// ---- Employees ------------------------------------------------------------------------------

export async function saveEmployee(db: DbOrTx, actor: Actor | null, raw: EmployeeInput) {
  const input = employeeSchema.parse(raw);
  if (input.leaveDate && input.leaveDate < input.joinDate) {
    throw new AppError("Leaving date can't be before the joining date", { leaveDate: "Before joining date" });
  }
  const values = {
    name: input.name,
    fatherName: input.fatherName,
    cnic: input.cnic,
    phone: input.phone,
    email: input.email,
    address: input.address,
    emergencyContact: input.emergencyContact,
    departmentId: input.departmentId,
    designation: input.designation,
    joinDate: input.joinDate,
    leaveDate: input.leaveDate,
    status: input.status,
    basicSalary: round2(input.basicSalary),
    allowances: round2(input.allowances),
    commissionPct: input.commissionPct,
    bankName: input.bankName,
    bankAccount: input.bankAccount,
    notes: input.notes,
  };

  if (input.id) {
    const [row] = await db.update(employees).set(values).where(eq(employees.id, input.id)).returning();
    if (!row) throw new AppError("Employee not found");
    await logAudit(db, actor, { action: "update", entity: "employee", entityId: row.id, summary: `Updated employee ${row.code} ${row.name}` });
    return { id: row.id, code: row.code };
  }

  const code = await nextNumber(db, "EMP");
  const [row] = await db.insert(employees).values({ code, ...values }).returning();
  await logAudit(db, actor, { action: "create", entity: "employee", entityId: row.id, summary: `Added employee ${code} ${row.name}` });
  return { id: row.id, code };
}

// ---- Departments & leave types --------------------------------------------------------------

export async function saveDepartment(db: DbOrTx, actor: Actor | null, raw: z.input<typeof departmentSchema>) {
  const input = departmentSchema.parse(raw);
  const clash = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(sql`lower(${departments.name}) = lower(${input.name})`, input.id ? ne(departments.id, input.id) : undefined));
  if (clash.length) throw new AppError(`A department called "${input.name}" already exists`);
  if (input.id) {
    await db.update(departments).set({ name: input.name }).where(eq(departments.id, input.id));
    await logAudit(db, actor, { action: "update", entity: "department", entityId: input.id, summary: `Renamed department to ${input.name}` });
    return { id: input.id };
  }
  const [row] = await db.insert(departments).values({ name: input.name }).returning();
  await logAudit(db, actor, { action: "create", entity: "department", entityId: row.id, summary: `Added department ${input.name}` });
  return { id: row.id };
}

export async function deleteDepartment(db: DbOrTx, actor: Actor | null, id: string) {
  const [row] = await db.select().from(departments).where(eq(departments.id, id));
  if (!row) throw new AppError("Department not found");
  // Employees keep working; their department is simply cleared (FK is "set null")
  await db.delete(departments).where(eq(departments.id, id));
  await logAudit(db, actor, { action: "delete", entity: "department", entityId: id, summary: `Deleted department ${row.name}` });
  return { id };
}

export async function saveLeaveType(db: DbOrTx, actor: Actor | null, raw: z.input<typeof leaveTypeSchema>) {
  const input = leaveTypeSchema.parse(raw);
  const clash = await db
    .select({ id: leaveTypes.id })
    .from(leaveTypes)
    .where(and(sql`lower(${leaveTypes.name}) = lower(${input.name})`, input.id ? ne(leaveTypes.id, input.id) : undefined));
  if (clash.length) throw new AppError(`A leave type called "${input.name}" already exists`);
  const values = { name: input.name, daysPerYear: input.daysPerYear, isPaid: input.isPaid };
  if (input.id) {
    await db.update(leaveTypes).set(values).where(eq(leaveTypes.id, input.id));
    await logAudit(db, actor, { action: "update", entity: "leave_type", entityId: input.id, summary: `Updated leave type ${input.name}` });
    return { id: input.id };
  }
  const [row] = await db.insert(leaveTypes).values(values).returning();
  await logAudit(db, actor, { action: "create", entity: "leave_type", entityId: row.id, summary: `Added leave type ${input.name}` });
  return { id: row.id };
}

export async function deleteLeaveType(db: DbOrTx, actor: Actor | null, id: string) {
  const [row] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, id));
  if (!row) throw new AppError("Leave type not found");
  const [used] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(leaveRequests).where(eq(leaveRequests.leaveTypeId, id));
  if (used.n > 0) throw new AppError(`"${row.name}" is used by ${used.n} leave request(s) and can't be deleted`);
  await db.delete(leaveTypes).where(eq(leaveTypes.id, id));
  await logAudit(db, actor, { action: "delete", entity: "leave_type", entityId: id, summary: `Deleted leave type ${row.name}` });
  return { id };
}

// ---- Attendance -----------------------------------------------------------------------------

/** Attendance for a month that has a posted payroll can't change (the salary is already booked). */
async function assertPeriodsOpen(db: DbOrTx, days: string[]) {
  const periods = [...new Set(days.map((d) => d.slice(0, 7)))];
  if (!periods.length) return;
  const posted = await db
    .select({ period: payrollRuns.period })
    .from(payrollRuns)
    .where(and(inArray(payrollRuns.period, periods), eq(payrollRuns.status, "posted")));
  if (posted.length) {
    throw new AppError(`Payroll for ${posted.map((p) => p.period).join(", ")} is already posted, so its attendance is locked. Void the payroll run first.`);
  }
}

/** Save the daily sheet: one upsert per employee+date; rows with status null clear that day. */
export async function saveAttendance(db: DbOrTx, actor: Actor | null, raw: AttendanceInput) {
  const input = attendanceSchema.parse(raw);
  await assertPeriodsOpen(db, [input.date]);

  const toClear = input.rows.filter((r) => r.status === null).map((r) => r.employeeId);
  const toSave = input.rows.filter((r) => r.status !== null);

  if (toClear.length) {
    await db.delete(attendance).where(and(eq(attendance.date, input.date), inArray(attendance.employeeId, toClear)));
  }
  for (const r of toSave) {
    const values = {
      employeeId: r.employeeId,
      date: input.date,
      status: r.status!,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      overtimeHours: r.overtimeHours,
      notes: r.notes,
    };
    await db
      .insert(attendance)
      .values(values)
      .onConflictDoUpdate({
        target: [attendance.employeeId, attendance.date],
        set: { status: values.status, checkIn: values.checkIn, checkOut: values.checkOut, overtimeHours: values.overtimeHours, notes: values.notes },
      });
  }
  await logAudit(db, actor, {
    action: "update",
    entity: "attendance",
    entityId: input.date,
    summary: `Marked attendance for ${input.date} (${toSave.length} saved${toClear.length ? `, ${toClear.length} cleared` : ""})`,
  });
  return { date: input.date, saved: toSave.length, cleared: toClear.length };
}

// ---- Leave ----------------------------------------------------------------------------------

export async function createLeaveRequest(db: DbOrTx, actor: Actor | null, raw: LeaveRequestInput) {
  const input = leaveRequestSchema.parse(raw);
  const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
  if (!emp) throw new AppError("Employee not found");
  const [type] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, input.leaveTypeId));
  if (!type) throw new AppError("Leave type not found");

  const days = workingDaysBetween(input.fromDate, input.toDate).length;
  if (days === 0) throw new AppError("The selected dates are all Sundays — no working days to take off", { toDate: "No working days" });

  const overlap = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, input.employeeId),
        inArray(leaveRequests.status, ["pending", "approved"]),
        lte(leaveRequests.fromDate, input.toDate),
        gte(leaveRequests.toDate, input.fromDate)
      )
    );
  if (overlap.length) throw new AppError(`${emp.name} already has a pending or approved leave overlapping these dates`);

  const [row] = await db
    .insert(leaveRequests)
    .values({ employeeId: input.employeeId, leaveTypeId: input.leaveTypeId, fromDate: input.fromDate, toDate: input.toDate, days, reason: input.reason })
    .returning();
  await logAudit(db, actor, {
    action: "create",
    entity: "leave_request",
    entityId: row.id,
    summary: `Leave request for ${emp.name}: ${type.name}, ${input.fromDate} to ${input.toDate} (${days} day${days === 1 ? "" : "s"})`,
  });
  return { id: row.id, days };
}

/**
 * Approve, reject or cancel a leave request. Approval marks each working day (Sundays skipped)
 * as "leave" in attendance; cancelling an approved request clears those leave days again.
 */
export async function decideLeave(db: DbOrTx, actor: Actor | null, raw: z.input<typeof leaveDecisionSchema>) {
  const input = leaveDecisionSchema.parse(raw);
  const [req] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, input.id));
  if (!req) throw new AppError("Leave request not found");
  const [type] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, req.leaveTypeId));
  const days = workingDaysBetween(req.fromDate, req.toDate);

  if (input.decision === "cancelled") {
    if (req.status !== "pending" && req.status !== "approved") throw new AppError(`This request is already ${req.status}`);
    if (req.status === "approved") {
      await assertPeriodsOpen(db, days);
      await db
        .delete(attendance)
        .where(and(eq(attendance.employeeId, req.employeeId), inArray(attendance.date, days), eq(attendance.status, "leave")));
    }
  } else {
    if (req.status !== "pending") throw new AppError(`This request is already ${req.status}`);
    if (input.decision === "approved") {
      await assertPeriodsOpen(db, days);
      for (const date of days) {
        await db
          .insert(attendance)
          .values({ employeeId: req.employeeId, date, status: "leave", notes: type?.name ?? "Leave" })
          .onConflictDoUpdate({
            target: [attendance.employeeId, attendance.date],
            set: { status: "leave", checkIn: null, checkOut: null, overtimeHours: 0, notes: type?.name ?? "Leave" },
          });
      }
    }
  }

  await db.update(leaveRequests).set({ status: input.decision, decidedBy: actor?.id ?? null }).where(eq(leaveRequests.id, req.id));
  const [emp] = await db.select({ name: employees.name }).from(employees).where(eq(employees.id, req.employeeId));
  await logAudit(db, actor, {
    action: input.decision === "approved" ? "approve" : input.decision === "rejected" ? "reject" : "cancel",
    entity: "leave_request",
    entityId: req.id,
    summary: `${input.decision === "approved" ? "Approved" : input.decision === "rejected" ? "Rejected" : "Cancelled"} ${type?.name ?? "leave"} for ${emp?.name ?? "employee"} (${req.fromDate} to ${req.toDate})`,
  });
  return { id: req.id, status: input.decision, days: days.length };
}

/**
 * Leave balances for a calendar year: entitled (days per year), taken (approved working days
 * that fall inside the year), remaining. One row per employee per leave type.
 */
export async function leaveBalances(db: DbOrTx, year: number, employeeId?: string) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const types = await db.select().from(leaveTypes).orderBy(leaveTypes.name);
  const reqs = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.fromDate, to),
        gte(leaveRequests.toDate, from),
        employeeId ? eq(leaveRequests.employeeId, employeeId) : undefined
      )
    );
  const taken = new Map<string, number>();
  for (const r of reqs) {
    const n = workingDaysBetween(r.fromDate < from ? from : r.fromDate, r.toDate > to ? to : r.toDate).length;
    const key = `${r.employeeId}:${r.leaveTypeId}`;
    taken.set(key, (taken.get(key) ?? 0) + n);
  }
  return { types, taken: (empId: string, typeId: string) => taken.get(`${empId}:${typeId}`) ?? 0 };
}

// ---- Advances & loans -----------------------------------------------------------------------

export async function assertCashBankAccount(db: DbOrTx, accountId: string) {
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!acc || acc.isGroup || !acc.isActive || !["cash", "bank", "petty_cash"].includes(acc.subtype ?? "")) {
    throw new AppError("Choose a cash or bank account to pay from", { paidFromAccountId: "Pick a cash or bank account" });
  }
  return acc;
}

/** Pay an advance or loan to an employee: Dr Employee Advances 1500 (employee), Cr Cash/Bank. */
export async function issueAdvance(db: DbOrTx, actor: Actor | null, raw: AdvanceInput) {
  const input = advanceSchema.parse(raw);
  const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
  if (!emp) throw new AppError("Employee not found");
  if (emp.status === "resigned" || emp.status === "terminated") throw new AppError(`${emp.name} is no longer employed`);
  const acc = await assertCashBankAccount(db, input.paidFromAccountId);

  const amount = round2(input.amount);
  // Cash in hand / petty cash can't be overdrawn (same rule as the Accounting screens)
  await assertCashAvailable(db, acc, amount, input.date);
  // No installment means "recover it all from the next salary"
  const installment = input.installmentAmount > 0 ? Math.min(round2(input.installmentAmount), amount) : amount;
  const number = await nextNumber(db, "ADV");
  const label = input.kind === "loan" ? "Loan" : "Advance";

  const [adv] = await db
    .insert(employeeAdvances)
    .values({
      number,
      date: input.date,
      employeeId: emp.id,
      kind: input.kind,
      amount,
      installmentAmount: installment,
      balance: amount,
      paidFromAccountId: acc.id,
      reason: input.reason,
      createdBy: actor?.id ?? null,
    })
    .returning();

  const je = await postJournal(db, actor, {
    date: input.date,
    memo: `${label} ${number} to ${emp.name}${input.reason ? ` — ${input.reason}` : ""}`,
    sourceType: "employee_advance",
    sourceId: adv.id,
    sourceNumber: number,
    lines: [
      { account: ACC.EMPLOYEE_ADVANCES, debit: amount, partyType: "employee", partyId: emp.id, memo: `${label} ${number} paid to ${emp.name}` },
      { account: acc.id, credit: amount, memo: `${label} ${number} paid to ${emp.name}` },
    ],
  });
  await db.update(employeeAdvances).set({ journalEntryId: je.id }).where(eq(employeeAdvances.id, adv.id));
  await logAudit(db, actor, {
    action: "create",
    entity: "employee_advance",
    entityId: adv.id,
    summary: `${label} ${number} of ${formatMoney(amount)} to ${emp.name}`,
  });
  return { id: adv.id, number };
}

/** Void an advance that nothing has been recovered from yet (reverses its journal). */
export async function voidAdvance(db: DbOrTx, actor: Actor | null, raw: z.input<typeof voidSchema>) {
  const input = voidSchema.parse(raw);
  const [adv] = await db.select().from(employeeAdvances).where(eq(employeeAdvances.id, input.id));
  if (!adv) throw new AppError("Advance not found");
  if (adv.status === "void") throw new AppError("This advance is already void");
  const [rec] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(advanceRecoveries)
    .where(eq(advanceRecoveries.advanceId, adv.id));
  if (rec.n > 0 || round2(adv.balance) !== round2(adv.amount)) {
    throw new AppError("Part of this advance has already been recovered through payroll, so it can't be voided");
  }
  await voidJournal(db, actor, adv.journalEntryId, input.reason ?? `Advance ${adv.number} voided`);
  await db.update(employeeAdvances).set({ status: "void", balance: 0 }).where(eq(employeeAdvances.id, adv.id));
  await logAudit(db, actor, {
    action: "void",
    entity: "employee_advance",
    entityId: adv.id,
    summary: `Voided advance ${adv.number}${input.reason ? `: ${input.reason}` : ""}`,
  });
  return { id: adv.id };
}

/** Open advances for employees, oldest first — what the next payroll will recover from. */
export async function openAdvances(db: DbOrTx, employeeIds?: string[]) {
  return db
    .select()
    .from(employeeAdvances)
    .where(and(eq(employeeAdvances.status, "open"), employeeIds ? inArray(employeeAdvances.employeeId, employeeIds) : undefined))
    .orderBy(employeeAdvances.date, employeeAdvances.number);
}

