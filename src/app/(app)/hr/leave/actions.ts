"use server";
import { action } from "@/server/action";
import { createLeaveRequest, decideLeave } from "@/server/services/hr";
import { leaveDecisionSchema, leaveRequestSchema } from "@/server/services/hr-schemas";

const revalidate = ["/hr"];

export const createLeaveAction = action({ permission: ["hr.attendance", "hr.manage"], schema: leaveRequestSchema, revalidate }, async (input, { tx, actor }) =>
  createLeaveRequest(tx, actor, input)
);

export const decideLeaveAction = action({ permission: "hr.attendance", schema: leaveDecisionSchema, revalidate }, async (input, { tx, actor }) =>
  decideLeave(tx, actor, input)
);
