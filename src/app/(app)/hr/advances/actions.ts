"use server";
import { action } from "@/server/action";
import { issueAdvance, voidAdvance } from "@/server/services/hr";
import { advanceSchema, voidSchema } from "@/server/services/hr-schemas";

const revalidate = ["/hr", "/accounting"];

export const issueAdvanceAction = action({ permission: "hr.payroll", schema: advanceSchema, revalidate }, async (input, { tx, actor }) =>
  issueAdvance(tx, actor, input)
);

export const voidAdvanceAction = action({ permission: "hr.payroll", schema: voidSchema, revalidate }, async (input, { tx, actor }) =>
  voidAdvance(tx, actor, input)
);
