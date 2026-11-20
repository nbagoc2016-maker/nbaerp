// Zod schemas for HR & payroll actions. Shared by server actions and services (no server-only).
import { z } from "zod";
import { zDay, zId, zMoney, zOptText } from "@/lib/schemas";

export const EMPLOYEE_STATUSES = ["active", "on_leave", "resigned", "terminated"] as const;
export const ATTENDANCE_STATUSES = ["present", "absent", "late", "half_day", "leave", "holiday"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const zTime = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Use HH:mm");

export const employeeSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Name is required"),
  fatherName: zOptText,
  cnic: zOptText,
  phone: zOptText,
  email: zOptText.refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), "Enter a valid email"),
  address: zOptText,
  emergencyContact: zOptText,
  departmentId: zOptText,
  designation: zOptText,
  joinDate: zDay,
  leaveDate: zDay.optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  status: z.enum(EMPLOYEE_STATUSES).default("active"),
  basicSalary: zMoney.default(0),
  allowances: zMoney.default(0),
  commissionPct: z.coerce.number().min(0).max(100).default(0),
  bankName: zOptText,
  bankAccount: zOptText,
  notes: zOptText,
});
export type EmployeeInput = z.input<typeof employeeSchema>;

export const departmentSchema = z.object({ id: z.string().optional().nullable(), name: z.string().trim().min(1, "Name is required") });
export const leaveTypeSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Name is required"),
  daysPerYear: z.coerce.number().min(0).max(366).default(0),
  isPaid: z.boolean().default(true),
});
export const idSchema = z.object({ id: zId });

export const attendanceSchema = z.object({
  date: zDay,
  rows: z
    .array(
      z.object({
        employeeId: zId,
        status: z.enum(ATTENDANCE_STATUSES).nullable(), // null clears the day
        checkIn: zTime,
        checkOut: zTime,
        overtimeHours: z.coerce.number().min(0).max(24).default(0),
        notes: zOptText,
      })
    )
    .min(1, "Nothing to save"),
});
export type AttendanceInput = z.input<typeof attendanceSchema>;

export const leaveRequestSchema = z
  .object({
    employeeId: zId,
    leaveTypeId: zId,
    fromDate: zDay,
    toDate: zDay,
    reason: zOptText,
  })
  .refine((v) => v.toDate >= v.fromDate, { message: "End date can't be before start date", path: ["toDate"] });
export type LeaveRequestInput = z.input<typeof leaveRequestSchema>;

export const leaveDecisionSchema = z.object({ id: zId, decision: z.enum(["approved", "rejected", "cancelled"]) });

export const advanceSchema = z.object({
  employeeId: zId,
  date: zDay,
  kind: z.enum(["advance", "loan"]).default("advance"),
  amount: z.coerce.number().positive("Amount must be more than zero"),
  installmentAmount: zMoney.default(0),
  paidFromAccountId: zId,
  reason: zOptText,
});
export type AdvanceInput = z.input<typeof advanceSchema>;

export const voidSchema = z.object({ id: zId, reason: zOptText });

export const payrollRunSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month"),
  date: zDay.optional().nullable(),
  notes: zOptText,
});
export type PayrollRunInput = z.input<typeof payrollRunSchema>;

export const payslipEditSchema = z.object({
  runId: zId,
  rows: z.array(
    z.object({
      id: zId,
      overtime: zMoney.default(0),
      commission: zMoney.default(0),
      bonus: zMoney.default(0),
      otherDeduction: zMoney.default(0),
      notes: zOptText,
    })
  ),
});
export type PayslipEditInput = z.input<typeof payslipEditSchema>;

export const PAY_METHODS = ["cash", "bank", "cheque", "wallet"] as const;

export const salaryPaymentSchema = z.object({
  payslipId: zId,
  date: zDay,
  amount: z.coerce.number().positive("Amount must be more than zero").optional().nullable(),
  paidFromAccountId: zId,
  method: z.enum(PAY_METHODS).default("cash"),
  reference: zOptText,
});
export type SalaryPaymentInput = z.input<typeof salaryPaymentSchema>;

export const payAllSchema = z.object({
  runId: zId,
  date: zDay,
  paidFromAccountId: zId,
  method: z.enum(PAY_METHODS).default("bank"),
  reference: zOptText,
});
export type PayAllInput = z.input<typeof payAllSchema>;
