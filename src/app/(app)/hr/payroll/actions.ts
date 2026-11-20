"use server";
import { action } from "@/server/action";
import { idSchema, payAllSchema, payrollRunSchema, payslipEditSchema, salaryPaymentSchema, voidSchema } from "@/server/services/hr-schemas";
import {
  createPayrollRun,
  deleteDraftRun,
  payAllSalaries,
  paySalary,
  postPayrollRun,
  recalculateRun,
  updatePayslips,
  voidPayrollRun,
  voidSalaryPayment,
} from "@/server/services/payroll";

const opts = { permission: "hr.payroll" as const, revalidate: ["/hr", "/accounting"] };

export const createPayrollRunAction = action({ ...opts, schema: payrollRunSchema }, async (input, { tx, actor }) => createPayrollRun(tx, actor, input));

export const savePayslipsAction = action({ ...opts, schema: payslipEditSchema }, async (input, { tx, actor }) => updatePayslips(tx, actor, input));

export const recalculateRunAction = action({ ...opts, schema: idSchema }, async (input, { tx, actor }) => recalculateRun(tx, actor, input.id));

/** Saves any unsaved grid edits, then posts, in one transaction. */
export const postPayrollRunAction = action({ ...opts, schema: payslipEditSchema }, async (input, { tx, actor }) => {
  if (input.rows.length) await updatePayslips(tx, actor, input);
  return postPayrollRun(tx, actor, input.runId);
});

export const deleteDraftRunAction = action({ ...opts, schema: idSchema }, async (input, { tx, actor }) => deleteDraftRun(tx, actor, input.id));

export const voidPayrollRunAction = action({ ...opts, schema: voidSchema }, async (input, { tx, actor }) => voidPayrollRun(tx, actor, input));

export const paySalaryAction = action({ ...opts, schema: salaryPaymentSchema }, async (input, { tx, actor }) => paySalary(tx, actor, input));

export const payAllSalariesAction = action({ ...opts, schema: payAllSchema }, async (input, { tx, actor }) => payAllSalaries(tx, actor, input));

export const voidSalaryPaymentAction = action({ ...opts, schema: voidSchema }, async (input, { tx, actor }) => voidSalaryPayment(tx, actor, input));
