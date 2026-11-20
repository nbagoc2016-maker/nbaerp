// HR & payroll service tests (in-memory DB): employees, attendance, leave, advances, payroll, salary payments.
import { and, eq } from "drizzle-orm";
import * as s from "../src/db/schema";
import { accountBalance, partyBalance, postJournal } from "../src/server/services/accounting";
import { ACC } from "../src/server/services/chart-of-accounts";
import {
  createLeaveRequest,
  decideLeave,
  issueAdvance,
  leaveBalances,
  saveAttendance,
  saveDepartment,
  saveEmployee,
  saveLeaveType,
  voidAdvance,
} from "../src/server/services/hr";
import { workingDaysBetween } from "../src/server/services/hr-dates";
import {
  calculateSlip,
  createPayrollRun,
  deleteDraftRun,
  payAllSalaries,
  paySalary,
  postPayrollRun,
  recalculateRun,
  updatePayslips,
  voidPayrollRun,
  voidSalaryPayment,
} from "../src/server/services/payroll";
import { check, createTestDb, done, expectError } from "./test-utils";

async function main() {
  const { db, close, actor } = await createTestDb();
  const accId = async (code: string) => (await db.select().from(s.accounts).where(eq(s.accounts.code, code)))[0].id;
  const cash = await accId(ACC.CASH);
  // Cash in hand can't be overdrawn, so start the till with a float
  await postJournal(db, actor, { date: "2026-10-01", memo: "Opening float", lines: [{ account: ACC.CASH, debit: 100000 }, { account: ACC.CAPITAL, credit: 100000 }] });
  const bank = await accId(ACC.BANK);

  console.log("Calendar");
  check("November 2026 has 25 working days (5 Sundays)", workingDaysBetween("2026-11-01", "2026-11-30").length === 25);
  check("October 2026 has 27 working days", workingDaysBetween("2026-10-01", "2026-10-31").length === 27);

  console.log("Employees & setup");
  const dept = await saveDepartment(db, actor, { name: "Sales" });
  await expectError("duplicate department rejected", () => saveDepartment(db, actor, { name: "sales" }), /already exists/);
  const annual = await saveLeaveType(db, actor, { name: "Annual Leave", daysPerYear: 14, isPaid: true });
  const unpaid = await saveLeaveType(db, actor, { name: "Unpaid Leave", daysPerYear: 0, isPaid: false });

  const a = await saveEmployee(db, actor, {
    name: "Ayesha Khan",
    fatherName: "Imran Khan",
    cnic: "35202-1234567-1",
    departmentId: dept.id,
    designation: "Sales Lead",
    joinDate: "2026-01-01",
    basicSalary: 40000,
    allowances: 10000,
    commissionPct: 1,
  });
  check("employee code from EMP series", a.code === "E-00001", a.code);
  const b = await saveEmployee(db, actor, { name: "Bilal Ahmed", joinDate: "2026-01-01", basicSalary: 25000 });
  await saveEmployee(db, actor, { name: "Old Hand", joinDate: "2024-01-01", leaveDate: "2026-06-30", status: "resigned", basicSalary: 30000 });
  await saveEmployee(db, actor, { id: b.id, name: "Bilal Ahmed", phone: "0300-1234567", joinDate: "2026-01-01", basicSalary: 25000 });
  const [bRow] = await db.select().from(s.employees).where(eq(s.employees.id, b.id));
  check("employee update keeps code", bRow.code === "E-00002" && bRow.phone === "0300-1234567", bRow);
  await expectError("leaving date before joining rejected", () =>
    saveEmployee(db, actor, { name: "X", joinDate: "2026-05-01", leaveDate: "2026-04-01" }), /before the joining/);

  console.log("Advances");
  const loan = await issueAdvance(db, actor, {
    employeeId: a.id,
    date: "2026-10-01",
    kind: "loan",
    amount: 5000,
    installmentAmount: 3000,
    paidFromAccountId: cash,
    reason: "Medical",
  });
  check("advance numbered", loan.number === "ADV-00001", loan.number);
  check("GL: employee advances 1500 debited", (await accountBalance(db, ACC.EMPLOYEE_ADVANCES)) === 5000);
  check("GL: cash credited", (await accountBalance(db, ACC.CASH)) === 95000);
  check("employee party balance from GL", (await partyBalance(db, "employee", a.id)) === 5000);
  const [loanJe] = await db.select().from(s.journalEntries).where(eq(s.journalEntries.sourceId, loan.id));
  check("advance journal source type", loanJe?.sourceType === "employee_advance");
  const advB = await issueAdvance(db, actor, { employeeId: b.id, date: "2026-11-02", amount: 1500, paidFromAccountId: cash });
  const [advBRow] = await db.select().from(s.employeeAdvances).where(eq(s.employeeAdvances.id, advB.id));
  check("advance with no installment is recovered in full", advBRow.installmentAmount === 1500, advBRow.installmentAmount);
  const salAcc = await accId(ACC.SALARIES);
  await expectError("advance from an expense account rejected", () =>
    issueAdvance(db, actor, { employeeId: a.id, date: "2026-11-02", amount: 100, paidFromAccountId: salAcc }), /cash or bank/);

  console.log("October payroll (installment recovery)");
  const oct = await createPayrollRun(db, actor, { period: "2026-10" });
  const octSlips = await db.select().from(s.payslips).where(eq(s.payslips.runId, oct.id));
  check("one payslip per employee to pay (resigned excluded)", octSlips.length === 2, octSlips.length);
  const octA = octSlips.find((p) => p.employeeId === a.id)!;
  check("October: no absence, full gross", octA.workingDays === 27 && octA.absentDays === 0 && octA.gross === 50000, octA);
  check("October: installment deducted", octA.advanceDeduction === 3000 && octA.net === 47000, octA);
  const octB = octSlips.find((p) => p.employeeId === b.id)!;
  check("advance issued after month end not recovered", octB.advanceDeduction === 0, octB.advanceDeduction);
  await expectError("same month can't be run twice", () => createPayrollRun(db, actor, { period: "2026-10" }), /already exists/);
  await postPayrollRun(db, actor, oct.id);
  const [octRun] = await db.select().from(s.payrollRuns).where(eq(s.payrollRuns.id, oct.id));
  const [octJe] = await db.select().from(s.journalEntries).where(eq(s.journalEntries.id, octRun.journalEntryId!));
  check("October posted, journal total = gross", octRun.status === "posted" && octJe.total === 75000, { run: octRun.status, total: octJe.total });
  check("October: gross = net + advance recovered", octRun.totalGross === octRun.totalNet + 3000, octRun);
  const [loanAfterOct] = await db.select().from(s.employeeAdvances).where(eq(s.employeeAdvances.id, loan.id));
  check("loan balance reduced by installment", loanAfterOct.balance === 2000 && loanAfterOct.status === "open", loanAfterOct);
  await expectError("partly recovered advance can't be voided", () => voidAdvance(db, actor, { id: loan.id }), /recovered/);

  console.log("Attendance");
  await saveAttendance(db, actor, {
    date: "2026-11-02",
    rows: [
      { employeeId: a.id, status: "present", checkIn: "09:00" },
      { employeeId: b.id, status: "present" },
    ],
  });
  await saveAttendance(db, actor, { date: "2026-11-02", rows: [{ employeeId: a.id, status: "absent", notes: "No show" }] });
  const nov2 = await db.select().from(s.attendance).where(and(eq(s.attendance.employeeId, a.id), eq(s.attendance.date, "2026-11-02")));
  check("attendance upsert keeps one row per employee+day", nov2.length === 1 && nov2[0].status === "absent", nov2);
  await saveAttendance(db, actor, {
    date: "2026-11-03",
    rows: [
      { employeeId: a.id, status: "half_day", checkIn: "09:00", checkOut: "13:00" },
      { employeeId: b.id, status: "late", checkIn: "10:15", overtimeHours: 2 },
    ],
  });
  await saveAttendance(db, actor, { date: "2026-11-01", rows: [{ employeeId: a.id, status: "absent" }] }); // a Sunday: ignored by payroll
  await saveAttendance(db, actor, { date: "2026-11-04", rows: [{ employeeId: b.id, status: "absent" }] });
  await saveAttendance(db, actor, { date: "2026-11-04", rows: [{ employeeId: b.id, status: null }] });
  const cleared = await db.select().from(s.attendance).where(and(eq(s.attendance.employeeId, b.id), eq(s.attendance.date, "2026-11-04")));
  check("status null clears the day", cleared.length === 0);
  await expectError("bad time rejected", () => saveAttendance(db, actor, { date: "2026-11-05", rows: [{ employeeId: a.id, status: "present", checkIn: "9am" }] }), /HH:mm/);

  console.log("Leave");
  const la = await createLeaveRequest(db, actor, { employeeId: a.id, leaveTypeId: annual.id, fromDate: "2026-11-06", toDate: "2026-11-09", reason: "Family" });
  check("leave days skip Sundays", la.days === 3, la.days);
  await expectError("overlapping leave rejected", () =>
    createLeaveRequest(db, actor, { employeeId: a.id, leaveTypeId: annual.id, fromDate: "2026-11-09", toDate: "2026-11-10" }), /overlapping/);
  await expectError("Sunday-only leave rejected", () =>
    createLeaveRequest(db, actor, { employeeId: a.id, leaveTypeId: annual.id, fromDate: "2026-11-15", toDate: "2026-11-15" }), /Sundays/);
  await decideLeave(db, actor, { id: la.id, decision: "approved" });
  const leaveDays = await db.select().from(s.attendance).where(and(eq(s.attendance.employeeId, a.id), eq(s.attendance.status, "leave")));
  check("approval writes attendance 'leave' for each working day", leaveDays.map((d) => d.date).sort().join() === "2026-11-06,2026-11-07,2026-11-09", leaveDays.map((d) => d.date));
  await expectError("can't decide twice", () => decideLeave(db, actor, { id: la.id, decision: "rejected" }), /already approved/);
  const lb = await createLeaveRequest(db, actor, { employeeId: b.id, leaveTypeId: unpaid.id, fromDate: "2026-11-10", toDate: "2026-11-11" });
  await decideLeave(db, actor, { id: lb.id, decision: "approved" });
  const lr = await createLeaveRequest(db, actor, { employeeId: b.id, leaveTypeId: annual.id, fromDate: "2026-11-20", toDate: "2026-11-20" });
  await decideLeave(db, actor, { id: lr.id, decision: "rejected" });
  const rejectedDays = await db.select().from(s.attendance).where(and(eq(s.attendance.employeeId, b.id), eq(s.attendance.date, "2026-11-20")));
  check("rejection writes no attendance", rejectedDays.length === 0);
  const bal = await leaveBalances(db, 2026);
  check("leave balance: taken this year", bal.taken(a.id, annual.id) === 3, bal.taken(a.id, annual.id));
  check("leave balance: rejected leave not counted", bal.taken(b.id, annual.id) === 0);

  console.log("Payroll calculation");
  check(
    "calculateSlip: absence uses (basic + allowances) / working days",
    calculateSlip({
      period: "2026-11",
      employee: { basicSalary: 20000, allowances: 5000, joinDate: "2020-01-01", leaveDate: null },
      attendance: [{ date: "2026-11-02", status: "half_day" }],
      unpaidLeaveDays: new Set(),
      advances: [],
    }).absenceDeduction === 500
  );
  const joiner = calculateSlip({
    period: "2026-11",
    employee: { basicSalary: 25000, allowances: 0, joinDate: "2026-11-16", leaveDate: null },
    attendance: [],
    unpaidLeaveDays: new Set(),
    advances: [],
  });
  check("mid-month joiner: days before joining are unpaid", joiner.absentDays === 12 && joiner.gross === 13000, joiner);

  const nov = await createPayrollRun(db, actor, { period: "2026-11" });
  let slips = await db.select().from(s.payslips).where(eq(s.payslips.runId, nov.id));
  let sa = slips.find((p) => p.employeeId === a.id)!;
  let sb = slips.find((p) => p.employeeId === b.id)!;
  check("absent 1 + half day 0.5 (Sunday & paid leave ignored)", sa.absentDays === 1.5 && sa.presentDays === 23.5, sa);
  check("absence deduction = 50000 / 25 × 1.5", sa.absenceDeduction === 3000, sa.absenceDeduction);
  check("advance installment capped at remaining balance", sa.advanceDeduction === 2000, sa.advanceDeduction);
  check("gross and net", sa.gross === 47000 && sa.net === 45000, sa);
  check("unpaid leave counts as absent", sb.absentDays === 2 && sb.absenceDeduction === 2000, sb);
  check("B advance recovered in full", sb.advanceDeduction === 1500 && sb.net === 21500, sb);

  await updatePayslips(db, actor, {
    runId: nov.id,
    rows: [
      { id: sa.id, overtime: 0, commission: 0, bonus: 1000, otherDeduction: 0 },
      { id: sb.id, overtime: 0, commission: 0, bonus: 0, otherDeduction: 500, notes: "Late fine" },
    ],
  });
  await expectError("net can't go negative", () =>
    updatePayslips(db, actor, { runId: nov.id, rows: [{ id: sb.id, overtime: 0, commission: 0, bonus: 0, otherDeduction: 999999 }] }), /negative/);
  await recalculateRun(db, actor, nov.id); // keeps grid edits
  slips = await db.select().from(s.payslips).where(eq(s.payslips.runId, nov.id));
  sa = slips.find((p) => p.employeeId === a.id)!;
  sb = slips.find((p) => p.employeeId === b.id)!;
  check("grid edits survive recalculation", sa.bonus === 1000 && sa.gross === 48000 && sa.net === 46000 && sb.otherDeduction === 500 && sb.net === 21000, { sa, sb });
  let [novRun] = await db.select().from(s.payrollRuns).where(eq(s.payrollRuns.id, nov.id));
  check("run totals", novRun.totalGross === 71000 && novRun.totalNet === 67000 && novRun.totalDeductions === 4000, novRun);
  await expectError("can't pay a draft run", () => paySalary(db, actor, { payslipId: sa.id, date: "2026-11-30", paidFromAccountId: cash }), /Post the payroll/);

  console.log("Post payroll");
  const payableBefore = await accountBalance(db, ACC.SALARIES_PAYABLE);
  const salariesBefore = await accountBalance(db, ACC.SALARIES);
  const advBefore = await accountBalance(db, ACC.EMPLOYEE_ADVANCES);
  await postPayrollRun(db, actor, nov.id);
  [novRun] = await db.select().from(s.payrollRuns).where(eq(s.payrollRuns.id, nov.id));
  const lines = await db.select().from(s.journalLines).where(eq(s.journalLines.entryId, novRun.journalEntryId!));
  const dr = lines.reduce((t, l) => t + l.debit, 0);
  const cr = lines.reduce((t, l) => t + l.credit, 0);
  check("journal balanced", dr === cr && dr === 71000, { dr, cr });
  check("salary expense up by gross less other deductions", (await accountBalance(db, ACC.SALARIES)) - salariesBefore === 70500);
  check("salaries payable up by total net", (await accountBalance(db, ACC.SALARIES_PAYABLE)) - payableBefore === 67000);
  check("advances down by recovered amount", advBefore - (await accountBalance(db, ACC.EMPLOYEE_ADVANCES)) === 3500);
  check("gross = net + advance recovered + other deductions", novRun.totalGross === novRun.totalNet + 3500 + 500, novRun);
  const payableLineA = lines.find((l) => l.partyId === a.id && l.credit === 46000);
  check("net salary credited per employee (party tagged)", payableLineA?.partyType === "employee");
  const [loanAfterNov] = await db.select().from(s.employeeAdvances).where(eq(s.employeeAdvances.id, loan.id));
  check("loan settled at zero", loanAfterNov.balance === 0 && loanAfterNov.status === "settled", loanAfterNov);
  const recs = await db.select().from(s.advanceRecoveries).where(eq(s.advanceRecoveries.advanceId, loan.id));
  check("recovery history recorded per run", recs.length === 2 && recs.reduce((t, r) => t + r.amount, 0) === 5000, recs);
  await expectError("attendance locked after posting", () => saveAttendance(db, actor, { date: "2026-11-12", rows: [{ employeeId: a.id, status: "absent" }] }), /locked/);
  await expectError("posted run can't be edited", () => updatePayslips(db, actor, { runId: nov.id, rows: [] }), /Void it first/);
  await expectError("posted run can't be deleted", () => deleteDraftRun(db, actor, nov.id), /draft/);

  console.log("Salary payments");
  const p1 = await paySalary(db, actor, { payslipId: sa.id, date: "2026-11-30", amount: 20000, paidFromAccountId: bank, method: "bank" });
  let [slipA] = await db.select().from(s.payslips).where(eq(s.payslips.id, sa.id));
  check("partial payment", slipA.status === "partial" && slipA.paidAmount === 20000, slipA);
  await expectError("can't overpay", () => paySalary(db, actor, { payslipId: sa.id, date: "2026-11-30", amount: 30000, paidFromAccountId: bank }), /still due/);
  const all = await payAllSalaries(db, actor, { runId: nov.id, date: "2026-11-30", paidFromAccountId: bank });
  check("pay all pays the rest", all.count === 2 && all.total === 26000 + 21000, all);
  [slipA] = await db.select().from(s.payslips).where(eq(s.payslips.id, sa.id));
  check("payslip paid", slipA.status === "paid" && slipA.paidAmount === 46000, slipA);
  [novRun] = await db.select().from(s.payrollRuns).where(eq(s.payrollRuns.id, nov.id));
  check("run total paid = total net", novRun.totalPaid === novRun.totalNet, novRun);
  check("November payable cleared (only October remains)", (await accountBalance(db, ACC.SALARIES_PAYABLE)) === octRun.totalNet);
  check("employee B is only owed unpaid October salary (GL party balance)", (await partyBalance(db, "employee", b.id)) === -octB.net, await partyBalance(db, "employee", b.id));
  const [payJe] = await db.select().from(s.journalEntries).where(eq(s.journalEntries.sourceId, p1.id));
  check("salary payment journal source", payJe.sourceType === "salary_payment");
  await expectError("Pay all when nothing is due", () => payAllSalaries(db, actor, { runId: nov.id, date: "2026-11-30", paidFromAccountId: bank }), /already been paid/);

  console.log("Void rules");
  await expectError("run with salary payments can't be voided", () => voidPayrollRun(db, actor, { id: nov.id }), /already been paid/);
  await voidSalaryPayment(db, actor, { id: p1.id });
  [slipA] = await db.select().from(s.payslips).where(eq(s.payslips.id, sa.id));
  check("voiding a payment reopens the payslip", slipA.status === "partial" && slipA.paidAmount === 26000, slipA);

  const fresh = await issueAdvance(db, actor, { employeeId: b.id, date: "2026-12-01", amount: 800, paidFromAccountId: cash });
  await voidAdvance(db, actor, { id: fresh.id });
  const [freshRow] = await db.select().from(s.employeeAdvances).where(eq(s.employeeAdvances.id, fresh.id));
  check("untouched advance can be voided", freshRow.status === "void");
  check("voided advance drops out of the GL", (await partyBalance(db, "employee", b.id)) === -octB.net);

  await voidPayrollRun(db, actor, { id: oct.id, reason: "Wrong salaries" });
  const [octVoid] = await db.select().from(s.payrollRuns).where(eq(s.payrollRuns.id, oct.id));
  check("October run void", octVoid.status === "void" && octVoid.period.startsWith("2026-10"), octVoid);
  const [loanRestored] = await db.select().from(s.employeeAdvances).where(eq(s.employeeAdvances.id, loan.id));
  check("void restores advance balance and reopens it", loanRestored.balance === 3000 && loanRestored.status === "open", loanRestored);
  check("GL advance balance matches open balances", (await accountBalance(db, ACC.EMPLOYEE_ADVANCES)) === 3000, await accountBalance(db, ACC.EMPLOYEE_ADVANCES));
  const octAgain = await createPayrollRun(db, actor, { period: "2026-10" });
  check("voided month can be run again", !!octAgain.id);
  await deleteDraftRun(db, actor, octAgain.id);
  check("draft run deleted", (await db.select().from(s.payrollRuns).where(eq(s.payrollRuns.id, octAgain.id))).length === 0);

  await close();
  done();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
