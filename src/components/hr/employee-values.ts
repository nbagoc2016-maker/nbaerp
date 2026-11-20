// Form values for the employee form (plain module so server pages can build them).
import { today } from "@/lib/format";

export interface EmployeeFormValues {
  id?: string | null;
  code?: string | null;
  name: string;
  fatherName: string;
  cnic: string;
  phone: string;
  email: string;
  address: string;
  emergencyContact: string;
  departmentId: string;
  designation: string;
  joinDate: string;
  leaveDate: string;
  status: "active" | "on_leave" | "resigned" | "terminated";
  basicSalary: string;
  allowances: string;
  commissionPct: string;
  bankName: string;
  bankAccount: string;
  notes: string;
}

export const emptyEmployee = (): EmployeeFormValues => ({
  name: "",
  fatherName: "",
  cnic: "",
  phone: "",
  email: "",
  address: "",
  emergencyContact: "",
  departmentId: "",
  designation: "",
  joinDate: today(),
  leaveDate: "",
  status: "active",
  basicSalary: "",
  allowances: "",
  commissionPct: "",
  bankName: "",
  bankAccount: "",
  notes: "",
});

type EmployeeRecord = {
  id: string;
  code: string;
  name: string;
  status: EmployeeFormValues["status"];
  joinDate: string;
  basicSalary: number;
  allowances: number;
  commissionPct: number;
} & Partial<Record<"fatherName" | "cnic" | "phone" | "email" | "address" | "emergencyContact" | "departmentId" | "designation" | "leaveDate" | "bankName" | "bankAccount" | "notes", string | null>>;

export function toEmployeeFormValues(e: EmployeeRecord): EmployeeFormValues {
  const s = (x: string | null | undefined) => x ?? "";
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    fatherName: s(e.fatherName),
    cnic: s(e.cnic),
    phone: s(e.phone),
    email: s(e.email),
    address: s(e.address),
    emergencyContact: s(e.emergencyContact),
    departmentId: s(e.departmentId),
    designation: s(e.designation),
    joinDate: e.joinDate,
    leaveDate: s(e.leaveDate),
    status: e.status,
    basicSalary: String(e.basicSalary || ""),
    allowances: String(e.allowances || ""),
    commissionPct: String(e.commissionPct || ""),
    bankName: s(e.bankName),
    bankAccount: s(e.bankAccount),
    notes: s(e.notes),
  };
}
