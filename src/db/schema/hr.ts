import { boolean, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, day, id, money, qty, updatedAt } from "./_helpers";
import { users } from "./core";

export const departments = pgTable("departments", {
  id: id(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

export const employees = pgTable(
  "employees",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    fatherName: text("father_name"),
    cnic: text("cnic"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    emergencyContact: text("emergency_contact"),
    departmentId: text("department_id").references(() => departments.id, { onDelete: "set null" }),
    designation: text("designation"),
    joinDate: day("join_date").notNull(),
    leaveDate: day("leave_date"),
    status: text("status", { enum: ["active", "on_leave", "resigned", "terminated"] })
      .notNull()
      .default("active"),
    basicSalary: money("basic_salary").notNull().default(0),
    allowances: money("allowances").notNull().default(0),
    commissionPct: money("commission_pct").notNull().default(0),
    bankName: text("bank_name"),
    bankAccount: text("bank_account"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }), // login, if any
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("employees_name_idx").on(t.name)]
);

export const attendance = pgTable(
  "attendance",
  {
    id: id(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: day("date").notNull(),
    status: text("status", { enum: ["present", "absent", "late", "half_day", "leave", "holiday"] }).notNull(),
    checkIn: text("check_in"), // HH:mm
    checkOut: text("check_out"),
    overtimeHours: qty("overtime_hours").notNull().default(0),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("attendance_emp_day_uq").on(t.employeeId, t.date)]
);

export const leaveTypes = pgTable("leave_types", {
  id: id(),
  name: text("name").notNull().unique(),
  daysPerYear: qty("days_per_year").notNull().default(0),
  isPaid: boolean("is_paid").notNull().default(true),
  createdAt: createdAt(),
});

export const leaveRequests = pgTable("leave_requests", {
  id: id(),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  leaveTypeId: text("leave_type_id")
    .notNull()
    .references(() => leaveTypes.id),
  fromDate: day("from_date").notNull(),
  toDate: day("to_date").notNull(),
  days: qty("days").notNull(),
  reason: text("reason"),
  status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).notNull().default("pending"),
  decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// Salary advances and staff loans, recovered through payroll deductions
export const employeeAdvances = pgTable("employee_advances", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.id),
  kind: text("kind", { enum: ["advance", "loan"] }).notNull().default("advance"),
  amount: money("amount").notNull(),
  installmentAmount: money("installment_amount").notNull().default(0), // deducted per payroll
  balance: money("balance").notNull(),
  paidFromAccountId: text("paid_from_account_id").notNull(),
  reason: text("reason"),
  status: text("status", { enum: ["open", "settled", "void"] }).notNull().default("open"),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: id(),
  number: text("number").notNull().unique(),
  period: text("period").notNull().unique(), // YYYY-MM
  date: day("date").notNull(), // posting date
  status: text("status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
  totalGross: money("total_gross").notNull().default(0),
  totalDeductions: money("total_deductions").notNull().default(0),
  totalNet: money("total_net").notNull().default(0),
  totalPaid: money("total_paid").notNull().default(0),
  notes: text("notes"),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const payslips = pgTable(
  "payslips",
  {
    id: id(),
    runId: text("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    workingDays: qty("working_days").notNull().default(0),
    presentDays: qty("present_days").notNull().default(0),
    absentDays: qty("absent_days").notNull().default(0),
    basic: money("basic").notNull().default(0),
    allowances: money("allowances").notNull().default(0),
    overtime: money("overtime").notNull().default(0),
    commission: money("commission").notNull().default(0),
    bonus: money("bonus").notNull().default(0),
    absenceDeduction: money("absence_deduction").notNull().default(0),
    advanceDeduction: money("advance_deduction").notNull().default(0),
    otherDeduction: money("other_deduction").notNull().default(0),
    gross: money("gross").notNull().default(0),
    net: money("net").notNull().default(0),
    paidAmount: money("paid_amount").notNull().default(0),
    status: text("status", { enum: ["unpaid", "partial", "paid"] }).notNull().default("unpaid"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("payslip_run_emp_uq").on(t.runId, t.employeeId)]
);

export const salaryPayments = pgTable("salary_payments", {
  id: id(),
  number: text("number").notNull().unique(),
  date: day("date").notNull(),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.id),
  payslipId: text("payslip_id").references(() => payslips.id),
  amount: money("amount").notNull(),
  paidFromAccountId: text("paid_from_account_id").notNull(),
  method: text("method", { enum: ["cash", "bank", "cheque", "wallet"] }).notNull().default("cash"),
  reference: text("reference"),
  status: text("status", { enum: ["posted", "void"] }).notNull().default("posted"),
  journalEntryId: text("journal_entry_id"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// How much of each advance/loan a posted payroll run recovered (one row per advance per payslip).
// Lets the advance show its recovery history and lets a voided run restore balances exactly.
export const advanceRecoveries = pgTable(
  "advance_recoveries",
  {
    id: id(),
    advanceId: text("advance_id")
      .notNull()
      .references(() => employeeAdvances.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    payslipId: text("payslip_id")
      .notNull()
      .references(() => payslips.id, { onDelete: "cascade" }),
    date: day("date").notNull(),
    amount: money("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("adv_recovery_adv_idx").on(t.advanceId), index("adv_recovery_run_idx").on(t.runId)]
);
