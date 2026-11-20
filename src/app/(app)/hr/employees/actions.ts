"use server";
import { action } from "@/server/action";
import { deleteDepartment, deleteLeaveType, saveDepartment, saveEmployee, saveLeaveType } from "@/server/services/hr";
import { departmentSchema, employeeSchema, idSchema, leaveTypeSchema } from "@/server/services/hr-schemas";

const revalidate = ["/hr"];

export const saveEmployeeAction = action({ permission: "hr.manage", schema: employeeSchema, revalidate }, async (input, { tx, actor }) =>
  saveEmployee(tx, actor, input)
);

export const saveDepartmentAction = action({ permission: "hr.manage", schema: departmentSchema, revalidate }, async (input, { tx, actor }) =>
  saveDepartment(tx, actor, input)
);

export const deleteDepartmentAction = action({ permission: "hr.manage", schema: idSchema, revalidate }, async (input, { tx, actor }) =>
  deleteDepartment(tx, actor, input.id)
);

export const saveLeaveTypeAction = action({ permission: "hr.manage", schema: leaveTypeSchema, revalidate }, async (input, { tx, actor }) =>
  saveLeaveType(tx, actor, input)
);

export const deleteLeaveTypeAction = action({ permission: "hr.manage", schema: idSchema, revalidate }, async (input, { tx, actor }) =>
  deleteLeaveType(tx, actor, input.id)
);
